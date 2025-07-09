import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Chip, TableSortLabel, InputAdornment, Tooltip
} from '@mui/material';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import AddLinkIcon from '@mui/icons-material/AddLink';
import SearchIcon from '@mui/icons-material/Search';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces ---
interface BpWidgetAccess {
    business_partner_id: string;
    business_partner_name: string;
    widget_type_id: string;
    widget_type_name: string;
    access_granted_at: string;
}

interface BusinessPartnerOption {
    id: string;
    name: string;
}

interface WidgetTypeOption {
    id: string;
    name: string;
    type_key: string;
}

// --- Sortier-Helferfunktionen ---
type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
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

const AdminBpWidgetAccessPage: React.FC = () => {
    const [bpWidgetAccess, setBpWidgetAccess] = useState<BpWidgetAccess[]>([]);
    const [businessPartnerOptions, setBusinessPartnerOptions] = useState<BusinessPartnerOption[]>([]);
    const [widgetTypeOptions, setWidgetTypeOptions] = useState<WidgetTypeOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openDialog, setOpenDialog] = useState(false);

    // Form states
    const [formBusinessPartnerId, setFormBusinessPartnerId] = useState('');
    const [formWidgetTypeId, setFormWidgetTypeId] = useState('');

    // States für Filter, Suche, Sortierung
    const [searchTerm, setSearchTerm] = useState('');
    const [order, setOrder] = useState<Order>('asc');
    const [orderBy, setOrderBy] = useState<keyof BpWidgetAccess>('business_partner_name');

    const { bpId } = useParams<{ bpId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const businessPartnerNameFromState = location.state?.businessPartnerName;

    const fetchAccessData = async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const accessUrl = bpId 
                ? `/api/admin/bp-widget-access/${bpId}`
                : '/api/admin/bp-widget-access';

            const [accessRes, bpRes, wtRes] = await Promise.all([
                apiClient.get(accessUrl, { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/business-partners', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/widget-types', { headers: { 'x-auth-token': token } }),
            ]);
            setBpWidgetAccess(accessRes.data);
            setBusinessPartnerOptions(bpRes.data.map((bp: any) => ({ id: bp.id, name: bp.name })));
            setWidgetTypeOptions(wtRes.data.map((wt: any) => ({ id: wt.id, name: wt.name, type_key: wt.type_key })));
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Zugriffsdaten.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccessData();
    }, [bpId]);

    const handleOpenAddDialog = () => {
        setFormBusinessPartnerId(bpId || ''); // BP vorauswählen, wenn gefiltert
        setFormWidgetTypeId('');
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setError(null);
    };

    const handleGrantAccess = async () => {
        if (!formBusinessPartnerId || !formWidgetTypeId) {
            setError('Bitte wählen Sie einen Business Partner und einen Widget-Typ aus.');
            return;
        }
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('jwt_token');
        try {
            await apiClient.post('/api/admin/bp-widget-access/grant', {
                business_partner_id: formBusinessPartnerId,
                widget_type_id: formWidgetTypeId,
            }, { headers: { 'x-auth-token': token } });
            handleCloseDialog();
            fetchAccessData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Gewähren des Zugriffs.');
        } finally {
            setLoading(false);
        }
    };

    const handleRevokeAccess = async (business_partner_id: string, widget_type_id: string) => {
        if (!window.confirm('Sind Sie sicher, dass Sie diesen Widget-Zugriff entziehen möchten?')) return;
        const token = localStorage.getItem('jwt_token');
        try {
            await apiClient.delete('/api/admin/bp-widget-access/revoke', {
                headers: { 'x-auth-token': token },
                data: { business_partner_id, widget_type_id },
            });
            fetchAccessData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Entziehen des Zugriffs.');
        }
    };
    
    const handleSortRequest = (property: keyof BpWidgetAccess) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleClearFilter = () => navigate('/admin/bp-widget-access');

    const sortedAndFilteredAccess = useMemo(() => {
        let filtered = [...bpWidgetAccess];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filtered = bpWidgetAccess.filter(item =>
                item.business_partner_name.toLowerCase().includes(lowercasedFilter) ||
                item.widget_type_name.toLowerCase().includes(lowercasedFilter)
            );
        }
        return filtered.sort(getComparator(order, orderBy));
    }, [bpWidgetAccess, searchTerm, order, orderBy]);

    return (
        <DashboardLayout>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                        <Typography variant="h4" component="h1">Widget-Zugriffsverwaltung ({sortedAndFilteredAccess.length})</Typography>
                        {bpId && businessPartnerNameFromState && (
                            <Chip label={`Filter: ${businessPartnerNameFromState}`} onDelete={handleClearFilter} sx={{ mt: 1 }} />
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField variant="outlined" size="small" placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}/>
                        <Button variant="contained" startIcon={<AddLinkIcon />} onClick={handleOpenAddDialog}>Zugriff gewähren</Button>
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
                                        <TableCell sortDirection={orderBy === 'business_partner_name' ? order : false}><TableSortLabel active={orderBy === 'business_partner_name'} direction={order} onClick={() => handleSortRequest('business_partner_name')}>Business Partner</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'widget_type_name' ? order : false}><TableSortLabel active={orderBy === 'widget_type_name'} direction={order} onClick={() => handleSortRequest('widget_type_name')}>Widget-Typ</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'access_granted_at' ? order : false}><TableSortLabel active={orderBy === 'access_granted_at'} direction={order} onClick={() => handleSortRequest('access_granted_at')}>Zugriff seit</TableSortLabel></TableCell>
                                        <TableCell align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredAccess.map((entry) => (
                                        <TableRow key={`${entry.business_partner_id}-${entry.widget_type_id}`} hover>
                                            <TableCell>
                                                <Tooltip title="Zur Business Partner Übersicht">
                                                    <Chip 
                                                        label={entry.business_partner_name} 
                                                        size="small" 
                                                        onClick={() => navigate('/admin/business-partners')}
                                                        clickable
                                                    />
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>
                                                <Tooltip title="Zur Widget-Typen Übersicht">
                                                    <Chip 
                                                        label={entry.widget_type_name} 
                                                        size="small" 
                                                        variant="outlined" 
                                                        onClick={() => navigate('/admin/widget-types')}
                                                        clickable
                                                    />
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>{new Date(entry.access_granted_at).toLocaleDateString('de-AT')}</TableCell>
                                            <TableCell align="right">
                                                <Tooltip title="Zugriff entziehen">
                                                    <IconButton color="error" onClick={() => handleRevokeAccess(entry.business_partner_id, entry.widget_type_id)}>
                                                        <LinkOffIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}

                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="xs">
                    <DialogTitle>Widget-Zugriff gewähren</DialogTitle>
                    <DialogContent>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        <TextField
                            select margin="dense" label="Business Partner" fullWidth variant="outlined"
                            value={formBusinessPartnerId}
                            onChange={(e) => setFormBusinessPartnerId(e.target.value)}
                            sx={{ mb: 2 }}
                            disabled={!!bpId} // Deaktivieren, wenn gefiltert
                        >
                            <MenuItem value=""><em>Business Partner wählen</em></MenuItem>
                            {businessPartnerOptions.map((bp) => (<MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>))}
                        </TextField>
                        <TextField
                            select margin="dense" label="Widget-Typ" fullWidth variant="outlined"
                            value={formWidgetTypeId}
                            onChange={(e) => setFormWidgetTypeId(e.target.value)}
                            sx={{ mb: 2 }}
                        >
                            <MenuItem value=""><em>Widget-Typ wählen</em></MenuItem>
                            {widgetTypeOptions.map((wt) => (<MenuItem key={wt.id} value={wt.id}>{wt.name} ({wt.type_key})</MenuItem>))}
                        </TextField>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog} color="secondary">Abbrechen</Button>
                        <Button onClick={handleGrantAccess} color="primary" disabled={loading}>Gewähren</Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </DashboardLayout>
    );
};

export default AdminBpWidgetAccessPage;
