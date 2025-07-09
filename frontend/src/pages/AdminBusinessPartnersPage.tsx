import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Switch, FormControlLabel, Tooltip as MuiTooltip, TableSortLabel, InputAdornment, Chip,
    Tabs, Tab, Grid
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import GroupIcon from '@mui/icons-material/Group';
import LinkIcon from '@mui/icons-material/Link';
import SearchIcon from '@mui/icons-material/Search';
import WidgetsIcon from '@mui/icons-material/Widgets';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces ---
interface Region {
    id: string;
    name: string;
    is_default?: boolean; // NEU
}

interface BusinessPartner {
    id: string;
    name: string;
    dashboard_title: string | null;
    address: string | null;
    logo_url: string | null;
    subscription_start_date: string;
    subscription_end_date: string;
    color_scheme_id: string | null;
    color_scheme_name: string | null;
    primary_color: string | null;
    is_active: boolean;
    user_count: string;
    url_businesspartner: string | null;
    regions: Region[];
    level_1_name: string | null;
    level_2_name: string | null;
    level_3_name: string | null;
}

interface ColorScheme {
    id: string;
    name: string;
    primary_color: string;
}

// --- Sortier-Helferfunktionen ---
type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    if (orderBy === 'regions') {
        const nameA = (a as any).regions?.[0]?.name || '';
        const nameB = (b as any).regions?.[0]?.name || '';
        if (nameB < nameA) return -1;
        if (nameB > nameA) return 1;
        return 0;
    }
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
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

const AdminBusinessPartnersPage: React.FC = () => {
    const [businessPartners, setBusinessPartners] = useState<BusinessPartner[]>([]);
    const [colorSchemes, setColorSchemes] = useState<ColorScheme[]>([]);
    const [regions, setRegions] = useState<Region[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingBp, setEditingBp] = useState<BusinessPartner | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof BusinessPartner>('name');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

    // Form states
    const [formName, setFormName] = useState('');
    const [formDashboardTitle, setFormDashboardTitle] = useState('');
    const [formAddress, setFormAddress] = useState('');
    const [formLogoUrl, setFormLogoUrl] = useState('');
    const [formSubscriptionStartDate, setFormSubscriptionStartDate] = useState('');
    const [formSubscriptionEndDate, setFormSubscriptionEndDate] = useState('');
    const [formColorSchemeId, setFormColorSchemeId] = useState<string | null>('');
    const [formRegionIds, setFormRegionIds] = useState<string[]>([]);
    const [formDefaultRegionId, setFormDefaultRegionId] = useState<string | null>(null); // NEU
    const [formIsActive, setFormIsActive] = useState(true);
    const [formUrlBusinessPartner, setFormUrlBusinessPartner] = useState('');
    const [formLevel1Name, setFormLevel1Name] = useState('');
    const [formLevel2Name, setFormLevel2Name] = useState('');
    const [formLevel3Name, setFormLevel3Name] = useState('');

    const navigate = useNavigate();

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const [bpRes, csRes, regRes] = await Promise.all([
                apiClient.get('/api/admin/business-partners', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/business-partners/colorschemes/all', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/business-partners/regions', { headers: { 'x-auth-token': token } }),
            ]);
            setBusinessPartners(bpRes.data);
            setColorSchemes(csRes.data);
            setRegions(regRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleOpenAddDialog = () => {
        setEditingBp(null);
        setFormName('');
        setFormDashboardTitle('');
        setFormAddress('');
        setFormLogoUrl('');
        setFormSubscriptionStartDate('');
        setFormSubscriptionEndDate('');
        setFormColorSchemeId('');
        setFormRegionIds([]);
        setFormDefaultRegionId(null); // NEU
        setFormIsActive(true);
        setFormUrlBusinessPartner('');
        setFormLevel1Name('');
        setFormLevel2Name('');
        setFormLevel3Name('');
        setOpenDialog(true);
    };

    const handleOpenEditDialog = (bp: BusinessPartner) => {
        setEditingBp(bp);
        setFormName(bp.name);
        setFormDashboardTitle(bp.dashboard_title || '');
        setFormAddress(bp.address || '');
        setFormLogoUrl(bp.logo_url || '');
        setFormSubscriptionStartDate(bp.subscription_start_date ? bp.subscription_start_date.split('T')[0] : '');
        setFormSubscriptionEndDate(bp.subscription_end_date ? bp.subscription_end_date.split('T')[0] : '');
        setFormColorSchemeId(bp.color_scheme_id || '');
        setFormRegionIds(bp.regions.map(r => r.id));
        
        // NEU: Standard-Region setzen
        const defaultRegion = bp.regions.find(r => r.is_default);
        setFormDefaultRegionId(defaultRegion?.id || bp.regions[0]?.id || null);

        setFormIsActive(bp.is_active);
        setFormUrlBusinessPartner(bp.url_businesspartner || '');
        setFormLevel1Name(bp.level_1_name || '');
        setFormLevel2Name(bp.level_2_name || '');
        setFormLevel3Name(bp.level_3_name || '');
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingBp(null);
        setError(null);
    };

    const handleSubmit = async () => {
        const token = localStorage.getItem('jwt_token');
        const bpData = {
            name: formName,
            dashboard_title: formDashboardTitle || null,
            address: formAddress || null,
            logo_url: formLogoUrl || null,
            subscription_start_date: formSubscriptionStartDate,
            subscription_end_date: formSubscriptionEndDate,
            color_scheme_id: formColorSchemeId || null,
            region_ids: formRegionIds,
            default_region_id: formDefaultRegionId, // NEU
            is_active: formIsActive,
            url_businesspartner: formUrlBusinessPartner || null,
            level_1_name: formLevel1Name || null,
            level_2_name: formLevel2Name || null,
            level_3_name: formLevel3Name || null,
        };

        try {
            if (editingBp) {
                await apiClient.put(`/api/admin/business-partners/${editingBp.id}`, bpData, { headers: { 'x-auth-token': token } });
            } else {
                await apiClient.post('/api/admin/business-partners', bpData, { headers: { 'x-auth-token': token } });
            }
            handleCloseDialog();
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern.');
        }
    };
    
    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher?')) return;
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(`/api/admin/business-partners/${id}`, { headers: { 'x-auth-token': token } });
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };

    const handleViewUsers = (bpId: string, bpName: string) => {
        navigate(`/admin/users/${bpId}`, { state: { businessPartnerName: bpName } });
    };
    
    const handleWidgetAccess = (bpId: string, bpName: string) => {
        navigate(`/admin/bp-widget-access/${bpId}`, { state: { businessPartnerName: bpName } });
    };

    const handleSortRequest = (property: keyof BusinessPartner) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredPartners = useMemo(() => {
        let filtered = [...businessPartners];
        
        if (statusFilter !== 'all') {
            filtered = filtered.filter(bp => bp.is_active === (statusFilter === 'active'));
        }

        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filtered = filtered.filter(bp =>
                bp.name.toLowerCase().includes(lowercasedFilter) ||
                (bp.address?.toLowerCase() || '').includes(lowercasedFilter) ||
                (bp.regions.some(r => r.name.toLowerCase().includes(lowercasedFilter)))
            );
        }
        return filtered.sort(getComparator(order, orderBy));
    }, [businessPartners, searchTerm, order, orderBy, statusFilter]);
    
    const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('de-AT');

    const getDaysRemaining = (endDateString: string | null): { text: string; color: string } => {
        if (!endDateString) return { text: '', color: 'text.secondary' };
        const endDate = new Date(endDateString);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return { text: `Abgelaufen`, color: 'error.main' };
        if (diffDays <= 30) return { text: `Noch ${diffDays} Tage`, color: 'warning.main' };
        return { text: ``, color: 'success.main' };
    };

    return (
        <DashboardLayout>
            <Container maxWidth={false} sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">Business Partner</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}/>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Hinzufügen</Button>
                    </Box>
                </Box>

                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                    <Tabs value={statusFilter} onChange={(e, newValue) => setStatusFilter(newValue)}>
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
                                        <TableCell sortDirection={orderBy === 'name' ? order : false} sx={{ width: '25%' }}><TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleSortRequest('name')}>Name</TableSortLabel></TableCell>
                                        <TableCell>Adresse</TableCell>
                                        <TableCell sortDirection={orderBy === 'regions' ? order : false}><TableSortLabel active={orderBy === 'regions'} direction={order} onClick={() => handleSortRequest('regions')}>Regionen</TableSortLabel></TableCell>
                                        <TableCell>Abo</TableCell>
                                        <TableCell>Farbschema</TableCell>
                                        <TableCell align="center">User</TableCell>
                                        <TableCell align="center">Widgets</TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredPartners.map((bp) => (
                                        <TableRow key={bp.id} hover sx={{ '& > *': { verticalAlign: 'top' } }}>
                                            <TableCell sx={{ p: 1 }}>
                                                <img src={bp.logo_url || 'https://placehold.co/60x40/eee/ccc?text=Logo'} alt="Logo" style={{ height: '40px', width: '60px', objectFit: 'contain', borderRadius: '4px' }} />
                                            </TableCell>
                                            <TableCell>
                                                <Box>
                                                    <Typography component="span" sx={{ fontWeight: 'bold' }}>{bp.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary" display="block">{bp.id}</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>{bp.address || '-'}</TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                    {bp.regions.map(region => <Chip key={region.id} label={region.name} size="small" variant={region.is_default ? 'filled' : 'outlined'} color={region.is_default ? 'primary' : 'default'} />)}
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Box>
                                                    {bp.subscription_start_date && bp.subscription_end_date ? `${formatDate(bp.subscription_start_date)} - ${formatDate(bp.subscription_end_date)}` : '-'}
                                                    <Typography variant="caption" display="block" sx={{ color: getDaysRemaining(bp.subscription_end_date).color, fontWeight: 'bold' }}>
                                                        {getDaysRemaining(bp.subscription_end_date).text}
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <MuiTooltip title={bp.color_scheme_name || 'Kein Schema'}><Box sx={{ width: 24, height: 24, bgcolor: bp.primary_color || 'transparent', border: '1px solid grey', borderRadius: '4px' }} /></MuiTooltip>
                                            </TableCell>
                                            <TableCell align="center">
                                                <MuiTooltip title="Benutzer verwalten">
                                                    <span>
                                                        <IconButton color="info" onClick={() => handleViewUsers(bp.id, bp.name)} disabled={parseInt(bp.user_count) === 0}>
                                                            <GroupIcon /> {bp.user_count}
                                                        </IconButton>
                                                    </span>
                                                </MuiTooltip>
                                            </TableCell>
                                            <TableCell align="center">
                                                <MuiTooltip title="Widget-Zugriff verwalten"><IconButton color="secondary" component={Link} to={`/admin/bp-widget-access/${bp.id}`} state={{ businessPartnerName: bp.name }}><WidgetsIcon /></IconButton></MuiTooltip>
                                            </TableCell>
                                            <TableCell>
                                                <MuiTooltip title="Bearbeiten"><IconButton color="primary" onClick={() => handleOpenEditDialog(bp)}><EditIcon /></IconButton></MuiTooltip>
                                                <MuiTooltip title="Löschen"><IconButton color="error" onClick={() => handleDelete(bp.id)}><DeleteIcon /></IconButton></MuiTooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
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
                            <Grid item xs={12} sm={6}>
                                <TextField label="Name" fullWidth value={formName} onChange={(e) => setFormName(e.target.value)} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField label="Dashboard-Titel" fullWidth value={formDashboardTitle} onChange={(e) => setFormDashboardTitle(e.target.value)} helperText="Dieser Titel wird im Dashboard angezeigt."/>
                            </Grid>
                            <Grid item xs={12}>
                                <TextField label="Adresse" fullWidth value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField label="Logo URL" fullWidth value={formLogoUrl} onChange={(e) => setFormLogoUrl(e.target.value)} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField label="Homepage URL" type="url" fullWidth value={formUrlBusinessPartner} onChange={(e) => setFormUrlBusinessPartner(e.target.value)} />
                            </Grid>
                             <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>Mitgliedslevel-Bezeichnungen</Typography>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField label="Level 1 Name" fullWidth value={formLevel1Name} onChange={(e) => setFormLevel1Name(e.target.value)} />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField label="Level 2 Name" fullWidth value={formLevel2Name} onChange={(e) => setFormLevel2Name(e.target.value)} />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField label="Level 3 Name" fullWidth value={formLevel3Name} onChange={(e) => setFormLevel3Name(e.target.value)} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField select label="Regionen" fullWidth value={formRegionIds} onChange={(e) => setFormRegionIds(e.target.value as unknown as string[])}
                                    SelectProps={{ multiple: true, renderValue: (selected) => (<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{(selected as string[]).map(id => <Chip key={id} size="small" label={regions.find(r => r.id === id)?.name} />)}</Box>) }}
                                >
                                    {regions.map((r) => (<MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>))}
                                </TextField>
                            </Grid>
                            {/* NEUES FELD FÜR STANDARD-REGION */}
                            <Grid item xs={12}>
                                <TextField
                                    select
                                    label="Standard-Region"
                                    fullWidth
                                    value={formDefaultRegionId || ''}
                                    onChange={(e) => setFormDefaultRegionId(e.target.value)}
                                    disabled={formRegionIds.length === 0}
                                    helperText="Diese Region wird als Voreinstellung in den Widgets verwendet."
                                >
                                    <MenuItem value="">
                                        <em>Keine</em>
                                    </MenuItem>
                                    {regions
                                        .filter(r => formRegionIds.includes(r.id))
                                        .map((r) => (
                                            <MenuItem key={r.id} value={r.id}>
                                                {r.name}
                                            </MenuItem>
                                        ))}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField label="Abo Startdatum" type="date" fullWidth InputLabelProps={{ shrink: true }} value={formSubscriptionStartDate} onChange={(e) => setFormSubscriptionStartDate(e.target.value)} />
                            </Grid>
                             <Grid item xs={12} sm={6}>
                                <TextField label="Abo Enddatum" type="date" fullWidth InputLabelProps={{ shrink: true }} value={formSubscriptionEndDate} onChange={(e) => setFormSubscriptionEndDate(e.target.value)} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField select label="Farbschema" fullWidth value={formColorSchemeId} onChange={(e) => setFormColorSchemeId(e.target.value)}>
                                    <MenuItem value=""><em>Kein Farbschema</em></MenuItem>
                                    {colorSchemes.map((cs) => (<MenuItem key={cs.id} value={cs.id}>{cs.name} <Box sx={{ width: 20, height: 20, bgcolor: cs.primary_color, border: '1px solid grey', ml: 1, display: 'inline-block', verticalAlign: 'middle' }} /></MenuItem>))}
                                </TextField>
                            </Grid>
                             <Grid item xs={12}>
                                <FormControlLabel control={<Switch checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} color="primary" />} label="Aktiv" />
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
