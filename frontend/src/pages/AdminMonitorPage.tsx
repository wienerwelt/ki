import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Button, Grid, Pagination, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions, IconButton, TableSortLabel,
    Snackbar, AlertProps
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';

// --- Interfaces ---
interface Log {
    id: string;
    timestamp: string;
    user_id: string;
    username: string;
    action_type: string;
    status: string;
    target_id: string;
    target_type: string;
    details: any;
    ip_address: string;
}

interface SnackbarState {
    open: boolean;
    message: string;
    severity: AlertProps['severity'];
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


const AdminMonitorPage: React.FC = () => {
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [selectedLog, setSelectedLog] = useState<Log | null>(null);

    // Filter States
    const [filterUsername, setFilterUsername] = useState('');
    const [filterActionType, setFilterActionType] = useState('');
    const [filterStartDate, setFilterStartDate] = useState('');
    const [filterEndDate, setFilterEndDate] = useState('');

    // Sort States
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof Log>('timestamp');

    // Delete States
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteUntilDate, setDeleteUntilDate] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Snackbar State
    const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });

    const fetchLogs = useCallback(async (currentPage = page) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const params = new URLSearchParams({
                page: String(currentPage),
                limit: '20',
            });
            if (filterUsername) params.append('username', filterUsername);
            if (filterActionType) params.append('actionType', filterActionType);
            if (filterStartDate) params.append('startDate', filterStartDate);
            if (filterEndDate) params.append('endDate', filterEndDate);

            const response = await apiClient.get(`/api/admin/monitor/activity?${params.toString()}`, {
                headers: { 'x-auth-token': token }
            });
            setLogs(response.data.logs);
            setTotalPages(response.data.totalPages);
            setPage(response.data.currentPage);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Protokolle.');
        } finally {
            setLoading(false);
        }
    }, [page, filterUsername, filterActionType, filterStartDate, filterEndDate]);

    useEffect(() => {
        fetchLogs(1);
        // Set default date for deletion to today
        const today = new Date();
        today.setDate(today.getDate() - 30); // Default to 30 days ago
        setDeleteUntilDate(today.toISOString().split('T')[0]);
    }, []); // Removed fetchLogs from dependency array to avoid re-fetching on every state change

    const handleFilter = () => {
        setPage(1);
        fetchLogs(1);
    };
    
    const handleClearFilters = () => {
        setFilterUsername('');
        setFilterActionType('');
        setFilterStartDate('');
        setFilterEndDate('');
        setPage(1);
        // Fetch logs with cleared filters
        fetchLogs(1);
    };

    const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
        setPage(value);
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
            const response = await apiClient.delete('/api/admin/monitor/logs', {
                params: { beforeDate: deleteUntilDate },
                headers: { 'x-auth-token': token }
            });
            setSnackbar({ open: true, message: response.data.message || 'Logs erfolgreich gelöscht.', severity: 'success' });
            handleCloseDeleteDialog();
            fetchLogs(1); // Refresh logs
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.message || 'Fehler beim Löschen der Logs.', severity: 'error' });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleCloseSnackbar = () => setSnackbar({ ...snackbar, open: false });

    const sortedLogs = useMemo(() => {
        return [...logs].sort(getComparator(order, orderBy));
    }, [logs, order, orderBy]);

    const formatDate = (dateString: string) => new Date(dateString).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'medium' });

    return (
        <DashboardLayout>
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Admin Aktivitätsmonitor
                </Typography>
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={6} md={2.5}>
                            <TextField fullWidth label="Nach Benutzername filtern" value={filterUsername} onChange={(e) => setFilterUsername(e.target.value)} size="small" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={2.5}>
                            <TextField fullWidth label="Nach Aktionstyp filtern" value={filterActionType} onChange={(e) => setFilterActionType(e.target.value)} size="small" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={2}>
                            <TextField fullWidth label="Startdatum" type="date" InputLabelProps={{ shrink: true }} value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} size="small" />
                        </Grid>
                        <Grid item xs={12} sm={6} md={2}>
                            <TextField fullWidth label="Enddatum" type="date" InputLabelProps={{ shrink: true }} value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} size="small" />
                        </Grid>
                        <Grid item xs={12} sm={4} md={1}>
                            <Button fullWidth variant="contained" onClick={handleFilter}>Filtern</Button>
                        </Grid>
                        <Grid item xs={12} sm={4} md={1}>
                             <Button fullWidth variant="outlined" onClick={handleClearFilters}>Reset</Button>
                        </Grid>
                        <Grid item xs={12} sm={4} md={1}>
                            <Button fullWidth variant="contained" color="error" startIcon={<DeleteIcon />} onClick={handleOpenDeleteDialog}>
                                Löschen
                            </Button>
                        </Grid>
                    </Grid>
                </Paper>

                {loading ? <Box sx={{display: 'flex', justifyContent: 'center', my: 4}}><CircularProgress /></Box> : error ? <Alert severity="error">{error}</Alert> : (
                    <>
                        <TableContainer component={Paper}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sortDirection={orderBy === 'timestamp' ? order : false}>
                                            <TableSortLabel active={orderBy === 'timestamp'} direction={orderBy === 'timestamp' ? order : 'asc'} onClick={() => handleSortRequest('timestamp')}>
                                                Zeitstempel
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sortDirection={orderBy === 'username' ? order : false}>
                                            <TableSortLabel active={orderBy === 'username'} direction={orderBy === 'username' ? order : 'asc'} onClick={() => handleSortRequest('username')}>
                                                Benutzer
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sortDirection={orderBy === 'action_type' ? order : false}>
                                            <TableSortLabel active={orderBy === 'action_type'} direction={orderBy === 'action_type' ? order : 'asc'} onClick={() => handleSortRequest('action_type')}>
                                                Aktion
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sortDirection={orderBy === 'status' ? order : false}>
                                            <TableSortLabel active={orderBy === 'status'} direction={orderBy === 'status' ? order : 'asc'} onClick={() => handleSortRequest('status')}>
                                                Status
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sortDirection={orderBy === 'ip_address' ? order : false}>
                                            <TableSortLabel active={orderBy === 'ip_address'} direction={orderBy === 'ip_address' ? order : 'asc'} onClick={() => handleSortRequest('ip_address')}>
                                                IP-Adresse
                                            </TableSortLabel>
                                        </TableCell>
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
            </Container>

            {/* Log Details Dialog */}
            <Dialog open={!!selectedLog} onClose={() => setSelectedLog(null)} fullWidth maxWidth="md">
                <DialogTitle>
                    Log-Details
                    <IconButton aria-label="close" onClick={() => setSelectedLog(null)} sx={{ position: 'absolute', right: 8, top: 8 }}>
                        <CloseIcon />
                    </IconButton>
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
                <DialogActions>
                    <Button onClick={() => setSelectedLog(null)}>Schließen</Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog}>
                <DialogTitle>Logs löschen</DialogTitle>
                <DialogContent>
                    <Typography>
                        Wählen Sie ein Datum. Alle Protokolleinträge, die vor diesem Datum erstellt wurden, werden unwiderruflich gelöscht.
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="delete-date"
                        label="Lösche Einträge vor"
                        type="date"
                        fullWidth
                        variant="standard"
                        value={deleteUntilDate}
                        onChange={(e) => setDeleteUntilDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDeleteDialog} disabled={isDeleting}>Abbrechen</Button>
                    <Button onClick={handleConfirmDelete} color="error" disabled={isDeleting}>
                        {isDeleting ? <CircularProgress size={24} /> : 'Endgültig löschen'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar for notifications */}
            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>

        </DashboardLayout>
    );
};

export default AdminMonitorPage;
