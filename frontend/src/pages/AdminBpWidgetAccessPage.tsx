import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
    Box, Typography, Container, Paper, CircularProgress, Alert, Button, Table, TableBody, TableCell, 
    TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, MenuItem, Chip, TableSortLabel, InputAdornment, Tooltip,
    List, ListItem, ListItemAvatar, ListItemText, Avatar
} from '@mui/material';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import AddLinkIcon from '@mui/icons-material/AddLink';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteIcon from '@mui/icons-material/Delete';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces ---
interface BpWidgetAccess {
    business_partner_id: string;
    business_partner_name: string;
    widget_type_id: string;
    widget_type_name: string;
    widget_type_key: string; 
    access_granted_at: string;
    user_install_count?: number; 
}

interface BusinessPartnerOption { id: string; name: string; }
interface WidgetTypeOption { id: string; name: string; type_key: string; }
interface InstallData { id: string; name: string; detail?: string; }

// --- Sortier-Helferfunktionen ---
type Order = 'asc' | 'desc';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    if (orderBy === 'user_install_count') {
        return Number(b[orderBy] || 0) - Number(a[orderBy] || 0);
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
): (a: any, b: any) => number {
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

    // States für Installations-Details
    const [installModalOpen, setInstallModalOpen] = useState(false);
    const [selectedAccess, setSelectedAccess] = useState<BpWidgetAccess | null>(null);
    const [installData, setInstallData] = useState<InstallData[]>([]);
    const [installLoading, setInstallLoading] = useState(false);

    // States für das sichere "Entziehen"-Modal
    const [revokeModalOpen, setRevokeModalOpen] = useState(false);

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
            const accessUrl = bpId ? `/api/admin/bp-widget-access/${bpId}` : '/api/admin/bp-widget-access';

            const [accessRes, bpRes, wtRes] = await Promise.all([
                apiClient.get(accessUrl, { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/business-partners', { headers: { 'x-auth-token': token } }),
                apiClient.get('/api/admin/widget-types', { headers: { 'x-auth-token': token } }),
            ]);
            
            // Failsafe: Verhindert Absturz, falls Backend Fehler zurückgibt
            setBpWidgetAccess(Array.isArray(accessRes.data) ? accessRes.data : []);
            setBusinessPartnerOptions(Array.isArray(bpRes.data) ? bpRes.data.map((bp: any) => ({ id: bp.id, name: bp.name })) : []);
            setWidgetTypeOptions(Array.isArray(wtRes.data) ? wtRes.data.map((wt: any) => ({ id: wt.id, name: wt.name, type_key: wt.type_key })) : []);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Zugriffsdaten.');
            setBpWidgetAccess([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccessData();
    }, [bpId]);

    const loadAffectedUsers = async (access: BpWidgetAccess) => {
        setInstallLoading(true);
        setInstallData([]);
        try {
            const token = localStorage.getItem('jwt_token');
            const res = await apiClient.get(
                `/api/admin/bp-widget-access/${access.business_partner_id}/widget/${access.widget_type_id}/installations`, 
                { headers: { 'x-auth-token': token } }
            );
            setInstallData(res.data);
        } catch (err) {
            console.error("Fehler beim Laden der Installationsdaten", err);
        } finally {
            setInstallLoading(false);
        }
    };

    const handleOpenInstallDetails = (access: BpWidgetAccess) => {
        if (!access.user_install_count || access.user_install_count === 0) return;
        setSelectedAccess(access);
        setInstallModalOpen(true);
        loadAffectedUsers(access);
    };

    const handleOpenRevokeModal = (access: BpWidgetAccess) => {
        setSelectedAccess(access);
        setRevokeModalOpen(true);
        if (access.user_install_count && access.user_install_count > 0) {
            loadAffectedUsers(access);
        }
    };

    const handleCloseInstallDetails = () => {
        setInstallModalOpen(false);
        setSelectedAccess(null);
    };

    const handleCloseRevokeModal = () => {
        setRevokeModalOpen(false);
        setSelectedAccess(null);
    };

    const handleOpenAddDialog = () => {
        setFormBusinessPartnerId(bpId || '');
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

    const confirmRevokeAccess = async () => {
        if (!selectedAccess) return;
        const token = localStorage.getItem('jwt_token');
        setLoading(true);
        try {
            await apiClient.delete(`/api/admin/bp-widget-access/revoke/${selectedAccess.business_partner_id}/${selectedAccess.widget_type_id}`, {
                headers: { 'x-auth-token': token },
            });
            handleCloseRevokeModal();
            fetchAccessData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Fehler beim Entziehen des Zugriffs.');
            setLoading(false);
        }
    };

    const handleRemoveWidgetFromUser = async (userId: string, userName: string) => {
        if (!selectedAccess) return;
        if (!window.confirm(`Möchten Sie das Widget "${selectedAccess.widget_type_name}" wirklich aus dem Dashboard von ${userName} entfernen?`)) return;
        
        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.delete(
                `/api/admin/users/${userId}/dashboard/widget/${selectedAccess.widget_type_key}`,
                { headers: { 'x-auth-token': token } }
            );
            
            // Nutzer sofort aus der lokalen Liste im Modal entfernen
            setInstallData(prev => prev.filter(u => u.id !== userId));
            
            // Den Zähler in der Haupttabelle im Hintergrund neu laden
            fetchAccessData();
            
        } catch (err: any) {
            alert('Fehler beim Entfernen des Widgets: ' + (err.response?.data?.message || err.message));
        }
    };
    
    const handleSortRequest = (property: keyof BpWidgetAccess) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleClearFilter = () => navigate('/admin/bp-widget-access');

    const sortedAndFilteredAccess = useMemo(() => {
        if (!Array.isArray(bpWidgetAccess)) return [];
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
                                        <TableCell align="center" sortDirection={orderBy === 'user_install_count' ? order : false}><TableSortLabel active={orderBy === 'user_install_count'} direction={order} onClick={() => handleSortRequest('user_install_count')}>Nutzer Installationen</TableSortLabel></TableCell>
                                        <TableCell sortDirection={orderBy === 'access_granted_at' ? order : false}><TableSortLabel active={orderBy === 'access_granted_at'} direction={order} onClick={() => handleSortRequest('access_granted_at')}>Zugriff seit</TableSortLabel></TableCell>
                                        <TableCell align="right">Aktionen</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedAndFilteredAccess.map((entry) => (
                                        <TableRow key={`${entry.business_partner_id}-${entry.widget_type_id}`} hover>
                                            <TableCell>
                                                <Tooltip title="Zur Business Partner Übersicht">
                                                    <Chip label={entry.business_partner_name} size="small" onClick={() => navigate('/admin/business-partners')} clickable />
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>
                                                <Tooltip title="Zur Widget-Typen Übersicht">
                                                    <Chip label={entry.widget_type_name} size="small" variant="outlined" onClick={() => navigate('/admin/widget-types')} clickable />
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Tooltip title={entry.user_install_count ? "Installationen ansehen" : "Noch nicht installiert"}>
                                                    <Chip 
                                                        icon={<PersonIcon fontSize="small" />} 
                                                        label={entry.user_install_count || 0} 
                                                        size="small" 
                                                        color={(entry.user_install_count || 0) > 0 ? "secondary" : "default"}
                                                        variant="outlined"
                                                        onClick={() => handleOpenInstallDetails(entry)}
                                                        sx={{ cursor: (entry.user_install_count || 0) > 0 ? 'pointer' : 'default' }}
                                                    />
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>{new Date(entry.access_granted_at).toLocaleDateString('de-AT')}</TableCell>
                                            <TableCell align="right">
                                                <Tooltip title="Zugriff entziehen">
                                                    <IconButton color="error" onClick={() => handleOpenRevokeModal(entry)}>
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

                {/* --- Dialog: Zugriff gewähren --- */}
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="xs">
                    <DialogTitle>Widget-Zugriff gewähren</DialogTitle>
                    <DialogContent>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        <TextField
                            select margin="dense" label="Business Partner" fullWidth variant="outlined"
                            value={formBusinessPartnerId} onChange={(e) => setFormBusinessPartnerId(e.target.value)} sx={{ mb: 2 }} disabled={!!bpId} 
                        >
                            <MenuItem value=""><em>Business Partner wählen</em></MenuItem>
                            {businessPartnerOptions.map((bp) => (<MenuItem key={bp.id} value={bp.id}>{bp.name}</MenuItem>))}
                        </TextField>
                        <TextField
                            select margin="dense" label="Widget-Typ" fullWidth variant="outlined"
                            value={formWidgetTypeId} onChange={(e) => setFormWidgetTypeId(e.target.value)} sx={{ mb: 2 }} disabled={!formBusinessPartnerId}
                        >
                            <MenuItem value=""><em>Widget-Typ wählen</em></MenuItem>
                            {widgetTypeOptions.map((wt) => {
                                const isAlreadyAssigned = Array.isArray(bpWidgetAccess) && bpWidgetAccess.some(access => access.business_partner_id === formBusinessPartnerId && access.widget_type_id === wt.id);
                                return (
                                    <MenuItem key={wt.id} value={wt.id} disabled={isAlreadyAssigned}>
                                        {wt.name} ({wt.type_key})
                                    </MenuItem>
                                );
                            })}
                        </TextField>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog} color="secondary">Abbrechen</Button>
                        <Button onClick={handleGrantAccess} color="primary" disabled={loading}>Gewähren</Button>
                    </DialogActions>
                </Dialog>

                {/* --- Dialog: Installations-Details --- */}
                <Dialog open={installModalOpen} onClose={handleCloseInstallDetails} fullWidth maxWidth="sm">
                    <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" component="div"> {/* DOM Nesting Fix */}
                            Nutzer von: {selectedAccess?.widget_type_name}
                        </Typography>
                        <IconButton onClick={handleCloseInstallDetails} size="small"><CloseIcon /></IconButton>
                    </DialogTitle>
                    <DialogContent dividers sx={{ minHeight: 200, p: 0 }}>
                        <Box sx={{ p: 2, pb: 1 }}>
                            <Typography variant="body2" color="text.secondary">
                                Business Partner: <strong>{selectedAccess?.business_partner_name}</strong>
                            </Typography>
                        </Box>
                        {installLoading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
                        ) : installData.length === 0 ? (
                            <Typography color="text.secondary" align="center" sx={{ py: 4 }}>Keine Nutzer gefunden.</Typography>
                        ) : (
                            <List disablePadding>
                                {installData.map((item) => (
                                    <ListItem 
                                        key={item.id} 
                                        divider
                                        secondaryAction={
                                            <Tooltip title="Widget aus dem Dashboard dieses Nutzers entfernen">
                                                <IconButton edge="end" color="error" onClick={() => handleRemoveWidgetFromUser(item.id, item.name)}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Tooltip>
                                        }
                                    >
                                        <ListItemAvatar><Avatar sx={{ bgcolor: 'secondary.main' }}><PersonIcon /></Avatar></ListItemAvatar>
                                        <ListItemText primary={item.name} secondary={item.detail || `ID: ${item.id}`} />
                                    </ListItem>
                                ))}
                            </List>
                        )}
                    </DialogContent>
                </Dialog>

                {/* --- Dialog: Sicher entziehen --- */}
                <Dialog open={revokeModalOpen} onClose={handleCloseRevokeModal} fullWidth maxWidth="sm">
                    <DialogTitle sx={{ color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <WarningAmberIcon /> Zugriff entziehen
                    </DialogTitle>
                    <DialogContent dividers>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                            Möchten Sie dem Partner <strong>{selectedAccess?.business_partner_name}</strong> den Zugriff auf das Widget <strong>{selectedAccess?.widget_type_name}</strong> wirklich entziehen?
                        </Typography>
                        
                        {(selectedAccess?.user_install_count || 0) > 0 && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                <strong>Achtung:</strong> {selectedAccess?.user_install_count} Nutzer haben dieses Widget derzeit auf ihrem Dashboard konfiguriert. Es wird nach dem Entziehen auf ihren Dashboards als fehlerhaft oder "nicht verfügbar" angezeigt.
                            </Alert>
                        )}

                        {installLoading && <CircularProgress size={24} sx={{ mt: 2 }} />}
                        
                        {!installLoading && installData.length > 0 && (
                            <Box sx={{ mt: 2, maxHeight: 150, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                <List dense disablePadding>
                                    {installData.map(user => (
                                        <ListItem key={user.id} divider>
                                            <ListItemText primary={user.name} secondary={user.detail} />
                                        </ListItem>
                                    ))}
                                </List>
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions sx={{ p: 2 }}>
                        <Button onClick={handleCloseRevokeModal} variant="outlined">Abbrechen</Button>
                        <Button onClick={confirmRevokeAccess} color="error" variant="contained" disabled={loading}>
                            Trotzdem entziehen
                        </Button>
                    </DialogActions>
                </Dialog>

            </Container>
        </DashboardLayout>
    );
};

export default AdminBpWidgetAccessPage;