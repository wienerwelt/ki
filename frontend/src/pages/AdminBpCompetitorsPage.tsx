// frontend/src/pages/AdminBpCompetitorsPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Tooltip as MuiTooltip, TableSortLabel, InputAdornment, Grid, Breadcrumbs, Link as MuiLink
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';

// --- Interfaces ---
interface Competitor {
    id: string;
    name: string;
    website_url: string | null;
    linkedin_url: string | null;
    notes: string | null;
}
interface Account { 
    id: string; 
    name: string; 
    business_partner_id: string; 
}
interface BusinessPartner { 
    id: string; 
    name: string; 
}

// --- Sorting ---
type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    if (b[orderBy] < a[orderBy]) return -1;
    if (b[orderBy] > a[orderBy]) return 1;
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

const AdminAccountCompetitorsPage: React.FC = () => {
    const { accountId } = useParams<{ accountId: string }>();
    const navigate = useNavigate();
    const { user, businessPartner: authenticatedBusinessPartner } = useAuth();
    const isAssistant = user?.role === 'assistenz';

    const [account, setAccount] = useState<Account | null>(null);
    const [businessPartner, setBusinessPartner] = useState<BusinessPartner | null>(null);
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof Competitor>('name');

    // Form states
    const [formName, setFormName] = useState('');
    const [formWebsite, setFormWebsite] = useState('');
    const [formLinkedin, setFormLinkedin] = useState('');
    const [formNotes, setFormNotes] = useState('');


useEffect(() => {
    const fetchData = async () => {
        if (!accountId) return;
        setLoading(true);
        setError(null);
        try {
            const [accRes, compRes] = await Promise.all([
                apiClient.get(`/api/admin/accounts/${accountId}`),
                apiClient.get(`/api/admin/competitors/for-account/${accountId}`)
            ]);

            const fetchedAccount = accRes.data;
            setAccount(fetchedAccount);

            // KORREKTUR: Sicherstellen, dass wir immer ein Array setzen
            setCompetitors(Array.isArray(compRes.data) ? compRes.data : []);

            if (isAssistant) {
                setBusinessPartner(authenticatedBusinessPartner
                    ? { id: authenticatedBusinessPartner.id, name: authenticatedBusinessPartner.name }
                    : { id: fetchedAccount.business_partner_id, name: user?.business_partner_name || 'Eigener Mandant' });
            } else if (fetchedAccount.business_partner_id) {
                const bpRes = await apiClient.get(`/api/admin/business-partners/${fetchedAccount.business_partner_id}`);
                setBusinessPartner(bpRes.data);
            }

        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Daten.');
            setCompetitors([]); // Auch im Fehlerfall auf ein leeres Array zurücksetzen
        } finally {
            setLoading(false);
        }
    };
    fetchData();
}, [accountId, authenticatedBusinessPartner, isAssistant, user?.business_partner_name]);

    const handleOpenAddDialog = () => {
        setEditingCompetitor(null);
        setFormName('');
        setFormWebsite('');
        setFormLinkedin('');
        setFormNotes('');
        setOpenDialog(true);
    };

    const handleOpenEditDialog = (comp: Competitor) => {
        setEditingCompetitor(comp);
        setFormName(comp.name);
        setFormWebsite(comp.website_url || '');
        setFormLinkedin(comp.linkedin_url || '');
        setFormNotes(comp.notes || '');
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingCompetitor(null);
        setError(null);
    };

// frontend/src/pages/AdminBpCompetitorsPage.tsx

const handleSubmit = async () => {
    if (!accountId) return;
    const competitorData = { 
        name: formName, 
        website_url: formWebsite, 
        linkedin_url: formLinkedin, 
        notes: formNotes 
    };
    try {
        if (editingCompetitor) {
            // Die `put`-Anfrage gibt den aktualisierten Wettbewerber zurück
            const response = await apiClient.put(`/api/admin/competitors/${editingCompetitor.id}`, competitorData);
            const updatedCompetitor = response.data;
            // Ersetze das alte Element in der Liste durch das aktualisierte
            setCompetitors(prev => 
                prev.map(c => c.id === updatedCompetitor.id ? updatedCompetitor : c)
            );
        } else {
            // Die `post`-Anfrage gibt den neu erstellten Wettbewerber zurück
            const response = await apiClient.post(`/api/admin/competitors/for-account/${accountId}`, competitorData);
            const newCompetitor = response.data;
            // Füge das neue Element zur bestehenden Liste hinzu
            setCompetitors(prev => [...prev, newCompetitor]);
        }
        handleCloseDialog();
    } catch (err: any) {
        setError(err.response?.data?.message || 'Fehler beim Speichern.');
    }
};

    const handleDelete = async (competitorId: string) => {
        if (!window.confirm('Sind Sie sicher?')) return;
        try {
            await apiClient.delete(`/api/admin/competitors/${competitorId}`);
            // UI aktualisieren durch Herausfiltern des gelöschten Elements
            setCompetitors(prev => prev.filter(c => c.id !== competitorId));
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Löschen.');
        }
    };

    const handleSortRequest = (property: keyof Competitor) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredCompetitors = useMemo(() => {
        let filtered = [...competitors];
        if (searchTerm) {
            filtered = filtered.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return filtered.sort(getComparator(order, orderBy));
    }, [competitors, searchTerm, order, orderBy]);

    return (
        <DashboardLayout>
            <Container maxWidth={false} sx={{ mt: 4, mb: 4 }}>
                <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
                    <MuiLink component={RouterLink} underline="hover" color="inherit" to="/radar">Account-Radar</MuiLink>
                    {!isAssistant && <MuiLink component={RouterLink} underline="hover" color="inherit" to="/admin/business-partners">Mandanten</MuiLink>}
                    <MuiLink component={RouterLink} underline="hover" color="inherit" to={`/admin/business-partners/${businessPartner?.id}/accounts`}>{businessPartner?.name || '...'}</MuiLink>
                    <Typography color="text.primary">{account?.name || '...'}</Typography>
                </Breadcrumbs>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="h4" component="h1">Wettbewerber Management</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }} />
                        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAddDialog}>Wettbewerber hinzufügen</Button>
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
                                        <TableCell>Notizen</TableCell>
                                        <TableCell>Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredCompetitors.map((comp) => (
                                        <TableRow key={comp.id} hover>
                                            <TableCell sx={{ width: '40%' }}>
                                                <Typography variant="body1" fontWeight="bold">{comp.name}</Typography>
                                                <MuiLink href={comp.website_url || '#'} target="_blank" rel="noopener noreferrer" variant="body2">{comp.website_url}</MuiLink>
                                            </TableCell>
                                            <TableCell sx={{ width: '45%' }}>
                                                <Typography variant="body2" color="text.secondary">{comp.notes}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <MuiTooltip title="Bearbeiten"><IconButton color="primary" onClick={() => handleOpenEditDialog(comp)}><EditIcon /></IconButton></MuiTooltip>
                                                <MuiTooltip title="Löschen"><IconButton color="error" onClick={() => handleDelete(comp.id)}><DeleteIcon /></IconButton></MuiTooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
                
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
                    <DialogTitle>{editingCompetitor ? 'Wettbewerber bearbeiten' : 'Neuen Wettbewerber hinzufügen'}</DialogTitle>
                    <DialogContent>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12}><TextField label="Name des Wettbewerbers" fullWidth value={formName} onChange={(e) => setFormName(e.target.value)} required /></Grid>
                            <Grid item xs={12}><TextField label="Website URL" fullWidth value={formWebsite} onChange={(e) => setFormWebsite(e.target.value)} /></Grid>
                            <Grid item xs={12}><TextField label="LinkedIn URL" fullWidth value={formLinkedin} onChange={(e) => setFormLinkedin(e.target.value)} /></Grid>
                            <Grid item xs={12}><TextField label="Notizen" fullWidth multiline rows={4} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} /></Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog} color="secondary">Abbrechen</Button>
                        <Button onClick={handleSubmit} color="primary">{editingCompetitor ? 'Speichern' : 'Hinzufügen'}</Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </DashboardLayout>
    );
};

export default AdminAccountCompetitorsPage;
