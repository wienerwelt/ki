import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Button, Grid, Pagination, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions, IconButton, TableSortLabel,
    Snackbar, Tooltip, Select, MenuItem, FormControl, InputLabel, Card, CardContent, Divider
} from '@mui/material';
import { AlertProps } from '@mui/material/Alert';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DnsIcon from '@mui/icons-material/Dns';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import StorageIcon from '@mui/icons-material/Storage';
import MemoryIcon from '@mui/icons-material/Memory';
import SettingsApplicationsIcon from '@mui/icons-material/SettingsApplications';
import CloudQueueIcon from '@mui/icons-material/CloudQueue'; // NEU: Icon für S3
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

import apiClient from '../apiClient';
import axios from 'axios';

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
    server: {
        uptime: string;
        memoryUsage: { rss: number };
        currentTime?: string;
        version?: string;
        s3Storage?: {          // NEU: S3 Storage Interface
            sizeMb: number;
            count: number;
        };
    };
    workers: { [key: string]: ServiceStatus };
}

const COMMON_ACTION_TYPES = [
    'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'USER_CREATED', 'USER_UPDATED', 
    'USER_DELETED', 'PASSWORD_CHANGED', 'DATA_EXPORT', 'SETTINGS_CHANGED'
];

const AdminMonitorPage: React.FC = () => {
    // Zustand für die Logs
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [totalLogs, setTotalLogs] = useState(0); 
    const [selectedLog, setSelectedLog] = useState<Log | null>(null);
    
    const [filterUsername, setFilterUsername] = useState('');
    const [filterActionType, setFilterActionType] = useState('all'); 
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');
    
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof Log>('timestamp');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteUntilDate, setDeleteUntilDate] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });
    const [globalStats, setGlobalStats] = useState({ success: 0, failed: 0 });

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

    const fetchLogs = useCallback(async (currentPage = 1) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({ 
                page: String(currentPage), 
                limit: '20',
                sortBy: orderBy,
                sortOrder: order
            });
            if (filterUsername) params.append('username', filterUsername);
            if (filterActionType && filterActionType !== 'all') params.append('actionType', filterActionType);
            if (filterStartDate) params.append('startDate', filterStartDate);
            if (filterEndDate) params.append('endDate', filterEndDate);
            
            const response = await apiClient.get(`/api/admin/monitor/activity?${params.toString()}`, { headers: { 'x-auth-token': token } });
            setLogs(response.data.logs);
            setTotalPages(response.data.totalPages);
            setPage(response.data.currentPage);
            setTotalLogs(response.data.totalItems || 0); 
            if (response.data.globalStats) {
                setGlobalStats(response.data.globalStats);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Protokolle.');
        } finally {
            setLoading(false);
        }
    }, [filterUsername, filterActionType, filterStartDate, filterEndDate, order, orderBy]);

    useEffect(() => {
        fetchLogs(1);
        const today = new Date();
        today.setDate(today.getDate() - 30);
        setDeleteUntilDate(today.toISOString().split('T')[0]);
    }, [fetchLogs]);

    const handleFilter = () => { setPage(1); fetchLogs(1); };
    const handleClearFilters = () => {
        setFilterUsername(''); setFilterActionType('all'); setFilterStartDate(''); setFilterEndDate(''); setPage(1); fetchLogs(1);
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
    const formatDate = (dateString: string) => new Date(dateString).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'medium' });

    const handleOpenBullBoard = async () => {
        try {
            const token = localStorage.getItem('jwt_token'); 
            if (!token) { alert("Du bist nicht eingeloggt!"); return; }
            const cleanToken = token.replace(/^"|"$/g, '');
            const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
            
            await axios.get(`${backendUrl}/api/admin/monitor/jobs-auth`, {
                headers: { Authorization: `Bearer ${cleanToken}` },
                withCredentials: true 
            });
            window.open(`${backendUrl}/api/admin/jobs`, '_blank');
        } catch (error) {
            alert('Zugriff auf das Job-Dashboard verweigert.');
        }
    };

    const chartData = useMemo(() => {
        return [
            { name: 'Erfolgreich', value: globalStats.success, color: '#2e7d32' },
            { name: 'Fehlgeschlagen', value: globalStats.failed, color: '#d32f2f' }
        ];
    }, [globalStats]);

    const renderHealthWidget = () => {
        if (isHealthLoading && !healthData) {
            return <Paper sx={{p: 4, mb: 4, display: 'flex', justifyContent: 'center'}}><CircularProgress size={30} /></Paper>;
        }

        const StatusChip: React.FC<{ service: ServiceStatus | undefined }> = ({ service }) => (
            <Tooltip title={service?.error || service?.status || 'unbekannt'}>
                <Chip
                    icon={service?.status === 'online' ? <CheckCircleIcon /> : <ErrorIcon />}
                    label={service?.status === 'online' ? 'Online' : 'Offline'}
                    color={service?.status === 'online' ? 'success' : 'error'}
                    size="small"
                    variant="outlined"
                    sx={{ ml: 'auto', fontWeight: 'bold' }}
                />
            </Tooltip>
        );

        return (
            <Box sx={{ mb: 4 }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold' }}>Systemzustand</Typography>
                {healthError && <Alert severity="warning" sx={{ mb: 2 }}>{healthError}</Alert>}
                {healthData && !healthError && (
                    <Grid container spacing={3}>
                        {/* Block 1: Datenbanken */}
                        <Grid item xs={12} md={4}>
                            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
                                <CardContent>
                                    <Typography variant="subtitle1" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, fontWeight: 'bold' }}>
                                        <StorageIcon color="primary" /> Datenbanken
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                                        <Typography variant="body2">PostgreSQL</Typography>
                                        <StatusChip service={healthData.postgres} />
                                    </Box>
                                    <Divider sx={{ my: 1 }} />
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Typography variant="body2">Redis Cache</Typography>
                                        <StatusChip service={healthData.redis} />
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Block 2: Server Metriken */}
                        <Grid item xs={12} md={4}>
                            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
                                <CardContent>
                                    <Typography variant="subtitle1" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, fontWeight: 'bold' }}>
                                        <MemoryIcon color="info" /> Server Metriken
                                    </Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                                        <Typography variant="body2">Uptime</Typography>
                                        <Typography variant="body2" fontWeight="bold">{healthData.server.uptime}</Typography>
                                    </Box>
                                    <Divider sx={{ my: 1 }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                                        <Typography variant="body2">RAM Auslastung</Typography>
                                        <Typography variant="body2" fontWeight="bold">{(healthData.server.memoryUsage.rss / 1024 / 1024).toFixed(2)} MB</Typography>
                                    </Box>
                                    
                                    {/* NEU: AWS S3 AUSLASTUNG */}
                                    {healthData.server.s3Storage && (
                                        <>
                                            <Divider sx={{ my: 1 }} />
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <CloudQueueIcon fontSize="small" color="primary" /> S3 Speicher
                                                </Typography>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {healthData.server.s3Storage.sizeMb.toFixed(2)} MB
                                                </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Typography variant="body2">S3 Dateien</Typography>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {healthData.server.s3Storage.count}
                                                </Typography>
                                            </Box>
                                        </>
                                    )}

                                    {healthData.server.currentTime && (
                                        <>
                                            <Divider sx={{ my: 1 }} />
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2">Server-Zeit</Typography>
                                                <Typography variant="body2">{new Date(healthData.server.currentTime).toLocaleString('de-AT', { timeStyle: 'short', dateStyle: 'short' })}</Typography>
                                            </Box>
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Block 3: Hintergrund-Dienste */}
                        <Grid item xs={12} md={4}>
                            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
                                <CardContent>
                                    <Typography variant="subtitle1" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, fontWeight: 'bold' }}>
                                        <SettingsApplicationsIcon color="warning" /> Hintergrund-Dienste
                                    </Typography>
                                    {Object.entries(healthData.workers || {}).map(([name, status], idx, arr) => (
                                        <React.Fragment key={name}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                                                <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{name}</Typography>
                                                <StatusChip service={status} />
                                            </Box>
                                            {idx < arr.length - 1 && <Divider sx={{ my: 1 }} />}
                                        </React.Fragment>
                                    ))}
                                    {Object.keys(healthData.workers || {}).length === 0 && (
                                        <Typography variant="body2" color="text.secondary">Keine Worker-Dienste gemeldet.</Typography>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                )}
            </Box>
        );
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
                Admin Aktivitätsmonitor
            </Typography>

            {renderHealthWidget()}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 4 }}>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>Sicherheitsprotokolle</Typography>
                {totalLogs > 0 && (
                    <Chip label={`Insgesamt ${totalLogs} Logs`} color="primary" variant="outlined" />
                )}
            </Box>

            {/* --- FILTER & CHARTS BEREICH --- */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} md={9}>
                    <Paper sx={{ p: 3, borderRadius: 2, height: '100%' }}>
                        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold', color: 'text.secondary' }}>Logs filtern & verwalten</Typography>
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={6} md={3}>
                                <TextField fullWidth label="Benutzername" value={filterUsername} onChange={(e) => setFilterUsername(e.target.value)} size="small" />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Aktionstyp</InputLabel>
                                    <Select value={filterActionType} label="Aktionstyp" onChange={(e) => setFilterActionType(e.target.value as string)}>
                                        <MenuItem value="all"><em>Alle Aktionen</em></MenuItem>
                                        {COMMON_ACTION_TYPES.map(action => (
                                            <MenuItem key={action} value={action}>{action}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <TextField fullWidth label="Startdatum" type="date" InputLabelProps={{ shrink: true }} value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} size="small" />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <TextField fullWidth label="Enddatum" type="date" InputLabelProps={{ shrink: true }} value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} size="small" />
                            </Grid>
                            <Grid item xs={12} sm={4} md={2}><Button fullWidth variant="contained" onClick={handleFilter}>Filtern</Button></Grid>
                            <Grid item xs={12} sm={4} md={2}><Button fullWidth variant="outlined" onClick={handleClearFilters}>Reset</Button></Grid>
                            
                            {/* Abstandshalter */}
                            <Grid item xs={12} sm={4} md={4} />

                            <Grid item xs={12} sm={6} md={2}>
                                <Button fullWidth variant="outlined" color="secondary" startIcon={<DnsIcon />} onClick={handleOpenBullBoard}>
                                    Job-Queue
                                </Button>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                                <Button fullWidth variant="contained" color="error" startIcon={<DeleteIcon />} onClick={handleOpenDeleteDialog}>Löschen</Button>
                            </Grid>
                        </Grid>
                    </Paper>
                </Grid>
                
                {/* --- KLEINES DIAGRAMM (Ansicht der aktuellen Seite) --- */}
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 2, borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'text.secondary', textAlign: 'center', mb: 1 }}>
                            Erfolgsquote (Gesamte Auswahl)
                        </Typography>
                        <Box sx={{ flexGrow: 1, minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {globalStats.success === 0 && globalStats.failed === 0 ? (
                                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                    Keine Daten für dieses Diagramm vorhanden.
                                </Typography>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value">
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip formatter={(value: number) => [`${value} Logs`, 'Anzahl']} />
                                        <Legend verticalAlign="bottom" height={20} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* --- TABELLE --- */}
            {loading ? <Box sx={{display: 'flex', justifyContent: 'center', my: 4}}><CircularProgress /></Box> : error ? <Alert severity="error">{error}</Alert> : (
                <>
                    <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
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
                                {logs.map((log) => (
                                    <TableRow key={log.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedLog(log)}>
                                        <TableCell>{formatDate(log.timestamp)}</TableCell>
                                        <TableCell>{log.username}</TableCell>
                                        <TableCell><Chip label={log.action_type} size="small" sx={{ bgcolor: 'action.hover', fontWeight: 'medium' }} /></TableCell>
                                        <TableCell>
                                            <Chip label={log.status} color={log.status === 'success' ? 'success' : 'error'} size="small" variant="outlined" sx={{ fontWeight: 'bold' }} />
                                        </TableCell>
                                        <TableCell>{log.ip_address}</TableCell>
                                    </TableRow>
                                ))}
                                {logs.length === 0 && (
                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>Keine Logs gefunden.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3 }}>
                        <Typography variant="body2" color="text.secondary">Seite {page} von {totalPages}</Typography>
                        <Pagination count={totalPages} page={page} onChange={handlePageChange} color="primary" shape="rounded" />
                    </Box>
                </>
            )}
            
            {/* --- DIALOGE --- */}
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
                            <Grid item xs={6}>
                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <strong>Status:</strong> <Chip label={selectedLog.status} color={selectedLog.status === 'success' ? 'success' : 'error'} size="small" />
                                </Typography>
                            </Grid>
                            {selectedLog.target_id && <Grid item xs={6}><Typography variant="body2"><strong>Ziel-ID:</strong> {selectedLog.target_id}</Typography></Grid>}
                            {selectedLog.target_type && <Grid item xs={6}><Typography variant="body2"><strong>Ziel-Typ:</strong> {selectedLog.target_type}</Typography></Grid>}
                            {selectedLog.details?.businessPartnerName && <Grid item xs={12}><Typography variant="body2"><strong>Business Partner:</strong> {selectedLog.details.businessPartnerName}</Typography></Grid>}
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{ mt: 2, fontWeight: 'bold' }}>Details (JSON):</Typography>
                                <Paper sx={{ p: 2, background: '#f8fafc', mt: 1, maxHeight: 400, overflowY: 'auto', border: '1px solid #e2e8f0' }}>
                                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontSize: '0.85rem' }}>
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
                    <TextField autoFocus margin="dense" id="delete-date" label="Lösche Einträge vor" type="date" fullWidth variant="outlined" value={deleteUntilDate} onChange={(e) => setDeleteUntilDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ mt: 2 }} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDeleteDialog} disabled={isDeleting}>Abbrechen</Button>
                    <Button onClick={handleConfirmDelete} variant="contained" color="error" disabled={isDeleting}>
                        {isDeleting ? <CircularProgress size={24} color="inherit" /> : 'Endgültig löschen'}
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