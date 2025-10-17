// frontend/src/pages/AdminBpAccountsPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Tooltip as MuiTooltip, TableSortLabel, InputAdornment, Chip, Grid, Breadcrumbs, Link as MuiLink
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces ---
interface Region { id: string; name: string; }
interface Category { id: string; name: string; }
interface Account {
    id: string;
    name: string;
    website_url: string | null;
    linkedin_url: string | null;
    status: 'prospect' | 'active_customer' | 'churned';
    notes: string | null;
    competitor_count: string;
    regions: Region[];
    categories: Category[];
}
interface BusinessPartner { id: string; name: string; }

// --- Helper Functions & Objects ---
const statusMapping = {
    prospect: 'Interessent',
    active_customer: 'Aktiv',
    churned: 'Abgewandert'
};

type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    let valA = a[orderBy];
    let valB = b[orderBy];

    if (orderBy === 'competitor_count') {
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

    const [businessPartner, setBusinessPartner] = useState<BusinessPartner | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [allRegions, setAllRegions] = useState<Region[]>([]);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
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
    const [formStatus, setFormStatus] = useState<'prospect' | 'active_customer' | 'churned'>('prospect');
    const [formRegionIds, setFormRegionIds] = useState<string[]>([]);
    const [formCategoryIds, setFormCategoryIds] = useState<string[]>([]);
    const [formNotes, setFormNotes] = useState('');

    const fetchData = async () => {
        if (!bpId) return;
        setLoading(true);
        setError(null);
        try {
            const [bpRes, accountsRes, regionsRes, categoriesRes] = await Promise.all([
                apiClient.get(`/api/admin/business-partners/${bpId}`),
                apiClient.get(`/api/admin/accounts/for-bp/${bpId}`),
                apiClient.get('/api/admin/business-partners/regions'),
                apiClient.get('/api/admin/accounts/all-categories')
            ]);
            setBusinessPartner(bpRes.data);
            setAccounts(accountsRes.data);
            setAllRegions(regionsRes.data);
            setAllCategories(categoriesRes.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [bpId]);
    
    const handleOpenAddDialog = () => {
        setEditingAccount(null);
        setFormName('');
        setFormWebsite('');
        setFormLinkedinUrl('');
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
        if (!bpId) return;
        const accountData = {
            name: formName,
            website_url: formWebsite,
            linkedin_url: formLinkedinUrl,
            status: formStatus,
            region_ids: formRegionIds,
            category_ids: formCategoryIds,
            notes: formNotes,
        };
        try {
            if (editingAccount) {
                await apiClient.put(`/api/admin/accounts/${editingAccount.id}`, accountData);
            } else {
                await apiClient.post(`/api/admin/accounts/for-bp/${bpId}`, accountData);
            }
            handleCloseDialog();
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Speichern.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Sind Sie sicher? Dieser Account wird endgültig gelöscht.')) return;
        try {
            await apiClient.delete(`/api/admin/accounts/${id}`);
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };

    const handleManageCompetitors = (accountId: string) => {
        navigate(`/admin/accounts/${accountId}/competitors`);
    };

    const handleSortRequest = (property: keyof Account) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredAccounts = useMemo(() => {
        let filtered = [...accounts];
        if (searchTerm) {
            filtered = filtered.filter(acc => acc.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return filtered.sort(getComparator(order, orderBy));
    }, [accounts, searchTerm, order, orderBy]);

    return (
        <DashboardLayout>
            <Container maxWidth={false} sx={{ mt: 4, mb: 4 }}>
                <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
                    <MuiLink component={RouterLink} underline="hover" color="inherit" to="/admin">Admin</MuiLink>
                    <MuiLink component={RouterLink} underline="hover" color="inherit" to="/admin/business-partners">Business Partners</MuiLink>
                    <Typography color="text.primary">{businessPartner?.name || '...'}</Typography>
                </Breadcrumbs>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">Account Management</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }} />
                        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Account hinzufügen</Button>
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
                                        <TableCell sortDirection={orderBy === 'regions' ? order : false}><TableSortLabel active={orderBy === 'regions'} direction={order} onClick={() => handleSortRequest('regions')}>Regionen</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'categories' ? order : false}><TableSortLabel active={orderBy === 'categories'} direction={order} onClick={() => handleSortRequest('categories')}>Branchen</TableSortLabel></TableCell>
                                        <TableCell align="center" sortDirection={orderBy === 'competitor_count' ? order : false}><TableSortLabel active={orderBy === 'competitor_count'} direction={order} onClick={() => handleSortRequest('competitor_count')}>Wettbewerber</TableSortLabel></TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredAccounts.map((acc) => (
                                        <TableRow key={acc.id} hover>
                                            <TableCell>
                                                <Typography variant="body1" fontWeight="bold">{acc.name}</Typography>
                                                <MuiLink href={acc.website_url || '#'} target="_blank" rel="noopener noreferrer" variant="body2">{acc.website_url}</MuiLink>
                                            </TableCell>
                                            <TableCell><Chip label={statusMapping[acc.status]} size="small" color={acc.status === 'active_customer' ? 'success' : 'default'} /></TableCell>
                                            <TableCell><Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{acc.regions.map(r => <Chip key={r.id} label={r.name} size="small" />)}</Box></TableCell>
                                            <TableCell><Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{acc.categories.map(c => <Chip key={c.id} label={c.name} size="small" variant="outlined" />)}</Box></TableCell>
                                            <TableCell align="center">
                                                <MuiTooltip title="Wettbewerber verwalten"><IconButton color="info" onClick={() => handleManageCompetitors(acc.id)}><TrackChangesIcon /><Typography component="span" sx={{ ml: 1 }}>{acc.competitor_count}</Typography></IconButton></MuiTooltip>
                                            </TableCell>
                                            <TableCell>
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
                
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
                    <DialogTitle>{editingAccount ? 'Account bearbeiten' : 'Neuen Account hinzufügen'}</DialogTitle>
                    <DialogContent>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12}><TextField label="Name des Accounts" fullWidth value={formName} onChange={(e) => setFormName(e.target.value)} required /></Grid>
                            <Grid item xs={12}><TextField label="Website URL" fullWidth value={formWebsite} onChange={(e) => setFormWebsite(e.target.value)} /></Grid>
                            <Grid item xs={12}><TextField label="LinkedIn URL" fullWidth value={formLinkedinUrl} onChange={(e) => setFormLinkedinUrl(e.target.value)} /></Grid>
                            <Grid item xs={12}>
                                <TextField select label="Status" fullWidth value={formStatus} onChange={(e) => setFormStatus(e.target.value as any)}>
                                    <MenuItem value="prospect">{statusMapping.prospect}</MenuItem>
                                    <MenuItem value="active_customer">{statusMapping.active_customer}</MenuItem>
                                    <MenuItem value="churned">{statusMapping.churned}</MenuItem>
                                </TextField>
                            </Grid>
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
            </Container>
        </DashboardLayout>
    );
};

export default AdminBpAccountsPage;