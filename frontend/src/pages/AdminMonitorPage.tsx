// frontend/src/pages/AdminMonitorPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Button, Grid, Pagination, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions, IconButton, TableSortLabel,
    Snackbar, Tooltip
} from '@mui/material';
import { AlertProps } from '@mui/material/Alert';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DnsIcon from '@mui/icons-material/Dns';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import apiClient from '../apiClient';

// --- Interfaces & Helper Functions ---
interface Log {
    id: string; timestamp: string; user_id: string; username: string; action_type: string; status: string;
    target_id: string; target_type: string; details: any; ip_address: string;
}
interface SnackbarState { open: boolean; message: string; severity: AlertProps['severity']; }
type Order = 'asc' | 'desc';

interface ServiceStatus {
    status: 'online' | 'offline';
    version?: string;
    error?: string;
}
interface HealthStatus {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    server: { uptime: string; memoryUsage: { rss: number } };
    workers: { [key: string]: ServiceStatus };
}

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}
function getComparator<Key extends keyof any>(order: Order, orderBy: Key,): (a: { [key in Key]: any }, b: { [key in Key]: any }) => number {
    return order === 'desc' ? (a, b) => descendingComparator(a, b, orderBy) : (a, b) => -descendingComparator(a, b, orderBy);
}
// --- Ende ---

const AdminMonitorPage: React.FC = () => {
    // Zustand für die Logs
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [selectedLog, setSelectedLog] = useState<Log | null>(null);
    const [filterUsername, setFilterUsername] = useState('');
    const [filterActionType, setFilterActionType] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof Log>('timestamp');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteUntilDate, setDeleteUntilDate] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });

    // --- HEALTH WIDGET LOGIK ---
    const [healthData, setHealthData] = useState<HealthStatus | null>(null);
    const [isHealthLoading, setIsHealthLoading] = useState(true);
    const [healthError, setHealthError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHealth = async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            if (!healthData && !healthError) setIsHealthLoading(true);
            
            try {
                const token = localStorage.getItem('jwt_token');
                const response = await apiClient.get('/api/admin/monitor/status', {
                    headers: { 'x-auth-token': token },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                setHealthData(response.data);
                setHealthError(null);
            } catch (err: any) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError' || err.code === 'ECONNABORTED') {
                    setHealthError('Timeout: Der Server antwortet nicht rechtzeitig.');
                } else {
                    setHealthError(err.response?.data?.message || 'Systemstatus konnte nicht geladen werden.');
                }
            } finally {
                setIsHealthLoading(false);
            }
        };

        fetchHealth();
        const interval = setInterval(fetchHealth, 30000);
        return () => clearInterval(interval);
    }, []);
    // --- HEALTH WIDGET LOGIK ENDE ---

    const fetchLogs = useCallback(async (currentPage = 1) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({ page: String(currentPage), limit: '20' });
            if (filterUsername) params.append('username', filterUsername);
            if (filterActionType) params.append('actionType', filterActionType);
            if (filterStartDate) params.append('startDate', filterStartDate);
            if (filterEndDate) params.append('endDate', filterEndDate);
            const response = await apiClient.get(`/api/admin/monitor/activity?${params.toString()}`, { headers: { 'x-auth-token': token } });
            setLogs(response.data.logs);
            setTotalPages(response.data.totalPages);
            setPage(response.data.currentPage);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Protokolle.');
        } finally {
            setLoading(false);
        }
    }, [filterUsername, filterActionType, filterStartDate, filterEndDate]);

    useEffect(() => {
        fetchLogs(1);
        const today = new Date();
        today.setDate(today.getDate() - 30);
        setDeleteUntilDate(today.toISOString().split('T')[0]);
    }, [fetchLogs]);

    const handleFilter = () => { setPage(1); fetchLogs(1); };
    const handleClearFilters = () => {
        setFilterUsername(''); setFilterActionType(''); setFilterStartDate(''); setFilterEndDate(''); setPage(1); fetchLogs(1);
    };
    const handlePageChange = (_event: React.ChangeEvent<unknown>, value: number) => { 
        fetchLogs(value); 
    };
    const handleSortRequest = (property: keyof Log) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };
    const handleOpenDeleteDialog = () => setDeleteDialogOpen(true);
    const handleCloseDeleteDialog = () => setDeleteDialogOpen(false);
    const handleConfirmDelete = async () => {
        if (!deleteUntilDate) {
            setSnackbar({ open: true, message: 'Bitte wählen Sie ein Datum aus.', severity: 'warning' });
            return;
        }
        setIsDeleting(true);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.delete('/api/admin/monitor/logs', { params: { beforeDate: deleteUntilDate }, headers: { 'x-auth-token': token } });
            setSnackbar({ open: true, message: response.data.message || 'Logs erfolgreich gelöscht.', severity: 'success' });
            handleCloseDeleteDialog();
            fetchLogs(1);
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.message || 'Fehler beim Löschen der Logs.', severity: 'error' });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleCloseSnackbar = () => setSnackbar({ ...snackbar, open: false });
    const sortedLogs = useMemo(() => { return [...logs].sort(getComparator(order, orderBy)); }, [logs, order, orderBy]);
    const formatDate = (dateString: string) => new Date(dateString).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'medium' });

    const handleOpenJobQueue = () => {
        const apiUrl = import.meta.env.VITE_API_URL || ''; 
        window.open(`${apiUrl}/api/admin/monitor/jobs-auth`, '_blank');
    };

    // --- HEALTH WIDGET RENDER-FUNKTION ---
    const renderHealthWidget = () => {
        if (isHealthLoading && !healthData) {
            return <Paper sx={{p: 2, mb: 3}}><CircularProgress size={20} /></Paper>;
        }

        const StatusChip: React.FC<{ service: ServiceStatus | undefined }> = ({ service }) => (
            <Tooltip title={service?.error || service?.status || 'unbekannt'}>
                <Chip
                    icon={service?.status === 'online' ? <CheckCircleIcon /> : <ErrorIcon />}
                    label={service?.status === 'online' ? 'Online' : 'Offline'}
                    color={service?.status === 'online' ? 'success' : 'error'}
                    size="small"
                    variant="outlined"
                />
            </Tooltip>
        );

        return (
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Systemzustand</Typography>
                {healthError && <Alert severity="warning">{healthError}</Alert>}
                {healthData && !healthError && (
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={4} md={3}><Typography component="span">PostgreSQL: <StatusChip service={healthData.postgres} /></Typography></Grid>
                        <Grid item xs={12} sm={4} md={3}><Typography component="span">Redis: <StatusChip service={healthData.redis} /></Typography></Grid>
                        
                        {/* KORREKTUR: Server Uptime und Memory wieder hinzugefügt */}
                        <Grid item xs={12} sm={4} md={3}><Typography>Server Uptime: {healthData.server.uptime}</Typography></Grid>
                        <Grid item xs={12} sm={4} md={3}><Typography>Memory: {(healthData.server.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB</Typography></Grid>
                        
                        {/* Dynamische Anzeige der Worker-Status */}
                        {Object.entries(healthData.workers || {}).map(([name, status]) => (
                             <Grid item xs={12} sm={4} md={3} key={name}><Typography component="span">{name}: <StatusChip service={status} /></Typography></Grid>
                        ))}
                    </Grid>
                )}
            </Paper>
        );
    };
    // --- HEALTH WIDGET RENDER-FUNKTION ENDE ---

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Admin Aktivitätsmonitor
            </Typography>

            {renderHealthWidget()}

            <Paper sx={{ p: 2, mb: 2 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={6} md={2}><TextField fullWidth label="Nach Benutzername filtern" value={filterUsername} onChange={(e) => setFilterUsername(e.target.value)} size="small" /></Grid>
                    <Grid item xs={12} sm={6} md={2}><TextField fullWidth label="Nach Aktionstyp filtern" value={filterActionType} onChange={(e) => setFilterActionType(e.target.value)} size="small" /></Grid>
                    <Grid item xs={12} sm={6} md={1.5}><TextField fullWidth label="Startdatum" type="date" InputLabelProps={{ shrink: true }} value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} size="small" /></Grid>
                    <Grid item xs={12} sm={6} md={1.5}><TextField fullWidth label="Enddatum" type="date" InputLabelProps={{ shrink: true }} value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} size="small" /></Grid>
                    <Grid item xs={12} sm={3} md={1}><Button fullWidth variant="contained" onClick={handleFilter}>Filtern</Button></Grid>
                    <Grid item xs={12} sm={3} md={1}><Button fullWidth variant="outlined" onClick={handleClearFilters}>Reset</Button></Grid>
                    <Grid item xs={12} sm={3} md={2}>
                        <Button fullWidth variant="outlined" color="secondary" startIcon={<DnsIcon />} onClick={handleOpenJobQueue}>
                            Job-Queue
                        </Button>
                    </Grid>
                    <Grid item xs={12} sm={3} md={1}><Button fullWidth variant="contained" color="error" startIcon={<DeleteIcon />} onClick={handleOpenDeleteDialog}>Löschen</Button></Grid>
                </Grid>
            </Paper>

            {loading ? <Box sx={{display: 'flex', justifyContent: 'center', my: 4}}><CircularProgress /></Box> : error ? <Alert severity="error">{error}</Alert> : (
                <>
                    <TableContainer component={Paper}>
                        <Table stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sortDirection={orderBy === 'timestamp' ? order : false}><TableSortLabel active={orderBy === 'timestamp'} direction={orderBy === 'timestamp' ? order : 'asc'} onClick={() => handleSortRequest('timestamp')}>Zeitstempel</TableSortLabel></TableCell>
                                    <TableCell sortDirection={orderBy === 'username' ? order : false}><TableSortLabel active={orderBy === 'username'} direction={orderBy === 'username' ? order : 'asc'} onClick={() => handleSortRequest('username')}>Benutzer</TableSortLabel></TableCell>
                                    <TableCell sortDirection={orderBy === 'action_type' ? order : false}><TableSortLabel active={orderBy === 'action_type'} direction={orderBy === 'action_type' ? order : 'asc'} onClick={() => handleSortRequest('action_type')}>Aktion</TableSortLabel></TableCell>
                                    <TableCell sortDirection={orderBy === 'status' ? order : false}><TableSortLabel active={orderBy === 'status'} direction={orderBy === 'status' ? order : 'asc'} onClick={() => handleSortRequest('status')}>Status</TableSortLabel></TableCell>
                                    <TableCell sortDirection={orderBy === 'ip_address' ? order : false}><TableSortLabel active={orderBy === 'ip_address'} direction={orderBy === 'ip_address' ? order : 'asc'} onClick={() => handleSortRequest('ip_address')}>IP-Adresse</TableSortLabel></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedLogs.map((log) => (
                                    <TableRow key={log.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedLog(log)}>
                                        <TableCell>{formatDate(log.timestamp)}</TableCell>
                                        <TableCell>{log.username}</TableCell>
                                        <TableCell>{log.action_type}</TableCell>
                                        <TableCell>
                                            <Chip label={log.status} color={log.status === 'success' ? 'success' : 'error'} size="small" />
                                        </TableCell>
                                        <TableCell>{log.ip_address}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                        <Pagination count={totalPages} page={page} onChange={handlePageChange} color="primary" />
                    </Box>
                </>
            )}
            
            <Dialog open={!!selectedLog} onClose={() => setSelectedLog(null)} fullWidth maxWidth="md">
                <DialogTitle>
                    Log-Details
                    <IconButton aria-label="close" onClick={() => setSelectedLog(null)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {selectedLog && (
                        <Grid container spacing={2}>
                            <Grid item xs={6}><Typography variant="body2"><strong>ID:</strong> {selectedLog.id}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="body2"><strong>Zeitstempel:</strong> {formatDate(selectedLog.timestamp)}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="body2"><strong>Benutzer:</strong> {selectedLog.username} ({selectedLog.user_id})</Typography></Grid>
                            <Grid item xs={6}><Typography variant="body2"><strong>IP-Adresse:</strong> {selectedLog.ip_address}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="body2"><strong>Aktion:</strong> {selectedLog.action_type}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="body2"><strong>Status:</strong> {selectedLog.status}</Typography></Grid>
                            {selectedLog.target_id && <Grid item xs={6}><Typography variant="body2"><strong>Ziel-ID:</strong> {selectedLog.target_id}</Typography></Grid>}
                            {selectedLog.target_type && <Grid item xs={6}><Typography variant="body2"><strong>Ziel-Typ:</strong> {selectedLog.target_type}</Typography></Grid>}
                            {selectedLog.details?.businessPartnerName && <Grid item xs={12}><Typography variant="body2"><strong>Business Partner:</strong> {selectedLog.details.businessPartnerName}</Typography></Grid>}
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{ mt: 2 }}>Details (JSON):</Typography>
                                <Paper sx={{ p: 2, background: '#f5f5f5', mt: 1, maxHeight: 400, overflowY: 'auto' }}>
                                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                                        {JSON.stringify(selectedLog.details, null, 2)}
                                    </pre>
                                </Paper>
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions><Button onClick={() => setSelectedLog(null)}>Schließen</Button></DialogActions>
            </Dialog>

            <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
                <DialogTitle>Logs löschen</DialogTitle>
                <DialogContent>
                    <Typography>Wählen Sie ein Datum. Alle Protokolleinträge, die vor diesem Datum erstellt wurden, werden unwiderruflich gelöscht.</Typography>
                    <TextField autoFocus margin="dense" id="delete-date" label="Lösche Einträge vor" type="date" fullWidth variant="standard" value={deleteUntilDate} onChange={(e) => setDeleteUntilDate(e.target.value)} InputLabelProps={{ shrink: true }} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDeleteDialog} disabled={isDeleting}>Abbrechen</Button>
                    <Button onClick={handleConfirmDelete} color="error" disabled={isDeleting}>
                        {isDeleting ? <CircularProgress size={24} /> : 'Endgültig löschen'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
            </Snackbar>
        </Container>
    );
};

export default AdminMonitorPage;