import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Box, Typography, Container, Paper, CircularProgress, Alert, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Button, Grid, Pagination, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions, IconButton, TableSortLabel,
    Snackbar, Tooltip, Select, MenuItem, FormControl, InputLabel, Card, CardContent, Divider,
    Avatar, Link
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
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

import apiClient from '../apiClient';
import { resolveAssetUrl } from '../utils/assetUrl';

// --- Interfaces & Helper Functions ---
interface Log {
    id: string; timestamp: string; user_id: string; username: string; action_type: string; status: string;
    target_id: string; target_type: string; details: any; ip_address: string;
}
interface LogUserProfile {
    id: string;
    username: string;
    first_name?: string | null;
    last_name?: string | null;
    organization_name?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedin_url?: string | null;
    login_count?: number | null;
    contribution_score?: number | null;
    membership_level?: string | null;
    role?: string | null;
    is_active?: boolean;
    active_until?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    last_login_at?: string | null;
    profile_image_url?: string | null;
    newsletter_opt_in?: boolean;
    business_partner_name?: string | null;
    business_partner_id?: string | null;
    tags?: string[];
}
interface SnackbarState { open: boolean; message: string; severity: AlertProps['severity']; }
type Order = 'asc' | 'desc';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const safeExternalUrl = (value?: string | null) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';

    try {
        const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
    } catch {
        return '';
    }
};

interface ArchiveFile {
    key: string;
    filename: string;
    sizeBytes: number;
    lastModified: string;
}

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
            totalSizeBytes?: number;
            count: number;
        };
    };
    workers: { [key: string]: ServiceStatus };
}

interface MonthlyReportMonitoring {
    settings: {
        id: string;
        name: string;
        allow_automated_newsletter: boolean;
        configured_recipients: number;
        eligible_recipients: number;
        briefing_recipients: number;
        newsletter_frequency: 'daily' | 'weekly' | 'monthly' | 'never';
        newsletter_delivery_mode: 'mobiliti' | 'export' | 'external';
        newsletter_recipient_limit: number;
    } | null;
    totals: { total: number; sent: number; failed: number; sending: number };
    monthly: Array<{ report_month: string; total: number; sent: number; failed: number; sending: number }>;
    deliveries: Array<{
        id: string;
        report_month: string;
        status: 'sending' | 'sent' | 'failed';
        created_at: string;
        sent_at?: string | null;
        failed_at?: string | null;
        error_message?: string | null;
        email: string;
        recipient_name?: string | null;
    }>;
    newsletterTotals: { total: number; sent: number; failed: number; sending: number; skipped: number };
    newsletterDeliveries: Array<{
        id: string;
        recipient_email: string;
        delivery_mode: 'mobiliti' | 'export' | 'external';
        status: 'sending' | 'sent' | 'failed' | 'skipped';
        created_at: string;
        sent_at?: string | null;
        failed_at?: string | null;
        error_message?: string | null;
    }>;
}

interface MonthlyReportPreview {
    simulation: true;
    sendsEmails: false;
    partner: {
        id: string;
        name: string;
        allowAutomatedNewsletter: boolean;
    };
    subject: string;
    reportMonth: string;
    period: {
        reportFrom: string;
        reportToExclusive: string;
        comparisonFrom: string;
        comparisonToExclusive: string;
    };
    stats: {
        monthName: string;
        logins: { current: number; prev: number };
        reads: { current: number; prev: number };
        community: { current: number; prev: number };
        downloads: { current: number; prev: number };
        storage: { percent: number; usedMb: string; limitMb: string };
    };
    recipients: Array<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: 'admin' | 'assistenz';
    }>;
}

const COMMON_ACTION_TYPES = [
    'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'USER_CREATED', 'USER_UPDATED', 
    'USER_DELETED', 'PASSWORD_CHANGED', 'DATA_EXPORT', 'SETTINGS_CHANGED', 'MONTHLY_REPORT_PREVIEW'
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
    const [selectedLogUser, setSelectedLogUser] = useState<LogUserProfile | null>(null);
    const [selectedLogUserLoading, setSelectedLogUserLoading] = useState(false);
    const [selectedLogUserMessage, setSelectedLogUserMessage] = useState<string | null>(null);
    const selectedLogUserRequest = useRef(0);
    
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
    const [monthlyReportData, setMonthlyReportData] = useState<MonthlyReportMonitoring | null>(null);
    const [monthlyReportLoading, setMonthlyReportLoading] = useState(true);
    const [monthlyReportError, setMonthlyReportError] = useState<string | null>(null);
    const [monthlyPreviewOpen, setMonthlyPreviewOpen] = useState(false);
    const [monthlyPreviewLoading, setMonthlyPreviewLoading] = useState(false);
    const [monthlyPreviewError, setMonthlyPreviewError] = useState<string | null>(null);
    const [monthlyPreview, setMonthlyPreview] = useState<MonthlyReportPreview | null>(null);

    // --- HEALTH WIDGET LOGIK ---
    const [healthData, setHealthData] = useState<HealthStatus | null>(null);
    const [isHealthLoading, setIsHealthLoading] = useState(true);
    const [healthError, setHealthError] = useState<string | null>(null);

    // --- STATE FÜR S3 ARCHIV ---
    const [showArchiveList, setShowArchiveList] = useState(false);
    const [archiveFiles, setArchiveFiles] = useState<ArchiveFile[]>([]);
    const [isArchiveLoading, setIsArchiveLoading] = useState(false);
    const [archiveSizeOrder, setArchiveSizeOrder] = useState<Order>('desc');

    const sortedArchiveFiles = useMemo(() => (
        [...archiveFiles].sort((a, b) => {
            const difference = Number(a.sizeBytes || 0) - Number(b.sizeBytes || 0);
            return archiveSizeOrder === 'asc' ? difference : -difference;
        })
    ), [archiveFiles, archiveSizeOrder]);

    const formatBytes = (value: number) => {
        const bytes = Number(value || 0);
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
        return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    };

    // --- FUNKTIONEN FÜR S3 ARCHIV ---
    const fetchArchiveFiles = async () => {
        setIsArchiveLoading(true);
        try {
            const token = 'cookie-session';
            const res = await apiClient.get('/api/admin/monitor/archive-files', { headers: { 'x-auth-token': token } });
            setArchiveFiles(res.data.files || []);
            setHealthData((current) => current ? {
                ...current,
                server: {
                    ...current.server,
                    s3Storage: {
                        sizeMb: Number(res.data.sizeMb || 0),
                        totalSizeBytes: Number(res.data.totalSizeBytes || 0),
                        count: Number(res.data.fileCount || 0),
                    },
                },
            } : current);
        } catch (err) {
            setSnackbar({ open: true, message: 'Fehler beim Laden des Archivs', severity: 'error' });
        } finally {
            setIsArchiveLoading(false);
        }
    };

    const handleDownloadArchiveFile = async (key: string) => {
        try {
            const token = 'cookie-session';
            const res = await apiClient.get(`/api/admin/monitor/archive-files/download?key=${encodeURIComponent(key)}`, { headers: { 'x-auth-token': token } });
            if (res.data && res.data.url) {
                window.open(res.data.url, '_blank');
            }
        } catch (err) {
            setSnackbar({ open: true, message: 'Download-Link konnte nicht generiert werden', severity: 'error' });
        }
    };

    useEffect(() => {
        const fetchHealth = async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            if (!healthData && !healthError) setIsHealthLoading(true);
            
            try {
                const token = 'cookie-session';
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
            const token = 'cookie-session';
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

    const fetchMonthlyReportData = useCallback(async () => {
        setMonthlyReportLoading(true);
        try {
            const response = await apiClient.get('/api/admin/monitor/monthly-report-deliveries');
            setMonthlyReportData(response.data);
            setMonthlyReportError(null);
        } catch (err: any) {
            setMonthlyReportError(err.response?.data?.message || 'Monatsreport-Statistik konnte nicht geladen werden.');
        } finally {
            setMonthlyReportLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMonthlyReportData();
    }, [fetchMonthlyReportData]);

    const handlePreviewMonthlyReport = async () => {
        setMonthlyPreviewOpen(true);
        setMonthlyPreviewLoading(true);
        setMonthlyPreviewError(null);
        setMonthlyPreview(null);
        try {
            const response = await apiClient.post<MonthlyReportPreview>('/api/admin/monitor/monthly-report-preview');
            const payload = response.data as MonthlyReportPreview | { message?: string } | null;
            if (!response.res.ok) {
                throw new Error(payload && 'message' in payload && payload.message
                    ? payload.message
                    : `Monatsreport-Simulation fehlgeschlagen (HTTP ${response.res.status}).`);
            }
            if (
                !payload
                || !('simulation' in payload)
                || payload.simulation !== true
                || !payload.partner?.id
                || !payload.stats
                || !Array.isArray(payload.recipients)
            ) {
                throw new Error('Die Monatsreport-Vorschau hat ein ungültiges Antwortformat.');
            }
            setMonthlyPreview(payload);
            fetchLogs(1);
        } catch (err: any) {
            setMonthlyPreviewError(err?.message || 'Monatsreport-Simulation konnte nicht erstellt werden.');
        } finally {
            setMonthlyPreviewLoading(false);
        }
    };

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
            const token = 'cookie-session';
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

    const handleSelectLog = async (log: Log) => {
        const requestId = ++selectedLogUserRequest.current;
        setSelectedLog(log);
        setSelectedLogUser(null);
        setSelectedLogUserMessage(null);

        if (!UUID_PATTERN.test(String(log.user_id || ''))) {
            setSelectedLogUserLoading(false);
            setSelectedLogUserMessage('Für diesen Systemeintrag ist kein Benutzerprofil verknüpft.');
            return;
        }

        setSelectedLogUserLoading(true);
        try {
            const response = await apiClient.get<LogUserProfile>(`/api/admin/users/${encodeURIComponent(log.user_id)}`);
            if (requestId !== selectedLogUserRequest.current) return;

            if (!response.res.ok || !response.data?.id) {
                setSelectedLogUserMessage(
                    response.res.status === 404
                        ? 'Das Benutzerprofil ist nicht mehr verfügbar. Der Protokolleintrag bleibt weiterhin lesbar.'
                        : (response.data as any)?.message || 'Das Benutzerprofil konnte nicht geladen werden.'
                );
                return;
            }

            setSelectedLogUser(response.data);
        } catch (err: any) {
            if (requestId === selectedLogUserRequest.current) {
                setSelectedLogUserMessage(err?.message || 'Das Benutzerprofil konnte nicht geladen werden.');
            }
        } finally {
            if (requestId === selectedLogUserRequest.current) {
                setSelectedLogUserLoading(false);
            }
        }
    };

    const handleCloseLogDetails = () => {
        selectedLogUserRequest.current += 1;
        setSelectedLog(null);
        setSelectedLogUser(null);
        setSelectedLogUserMessage(null);
        setSelectedLogUserLoading(false);
    };

    const handleOpenBullBoard = async () => {
        try {
            const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
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
                                                    <CloudQueueIcon fontSize="small" color="primary" /> AWS Speicher
                                                </Typography>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {formatBytes(
                                                        healthData.server.s3Storage.totalSizeBytes
                                                        ?? healthData.server.s3Storage.sizeMb * 1024 * 1024
                                                    )}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Archiv-Dateien ({healthData.server.s3Storage.count})
                                                </Typography>
                                            </Box>

                                            {/* LAZY LOADING ARCHIV LISTE */}
                                            <Box sx={{ mt: 2 }}>
                                                <Button 
                                                    variant="outlined" 
                                                    size="small" 
                                                    fullWidth 
                                                    onClick={() => {
                                                        setShowArchiveList(!showArchiveList);
                                                        if (!showArchiveList && (!archiveFiles || archiveFiles.length === 0)) fetchArchiveFiles();
                                                    }}
                                                >
                                                    {showArchiveList ? 'Archiv ausblenden' : 'Archiv-Dateien verwalten'}
                                                </Button>

                                                {showArchiveList && (
                                                    <Box sx={{ mt: 2, maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                                                        {isArchiveLoading ? (
                                                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={20} /></Box>
                                                        ) : (!archiveFiles || archiveFiles.length === 0) ? (
                                                            <Typography variant="body2" sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>Keine Dateien im Archiv.</Typography>
                                                        ) : (
                                                            <Table size="small" stickyHeader>
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>Datei</TableCell>
                                                                        <TableCell align="right" sortDirection={archiveSizeOrder}>
                                                                            <TableSortLabel
                                                                                active
                                                                                direction={archiveSizeOrder}
                                                                                onClick={() => setArchiveSizeOrder((current) => current === 'asc' ? 'desc' : 'asc')}
                                                                            >
                                                                                Größe
                                                                            </TableSortLabel>
                                                                        </TableCell>
                                                                        <TableCell align="center">Aktionen</TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {sortedArchiveFiles.map((file) => (
                                                                        <TableRow key={file.key} hover>
                                                                            <TableCell sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                <Tooltip title={file.filename}>
                                                                                    <Typography variant="caption">{file.filename}</Typography>
                                                                                </Tooltip>
                                                                                <br/>
                                                                                <Typography variant="caption" color="text.secondary">
                                                                                    {new Date(file.lastModified).toLocaleDateString('de-DE')}
                                                                                </Typography>
                                                                            </TableCell>
                                                                            <TableCell align="right"><Typography variant="caption">{formatBytes(file.sizeBytes)}</Typography></TableCell>
                                                                            <TableCell align="center">
                                                                                <Tooltip title="Herunterladen">
                                                                                    <IconButton size="small" onClick={() => handleDownloadArchiveFile(file.key)}><CloudQueueIcon fontSize="small" /></IconButton>
                                                                                </Tooltip>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        )}
                                                    </Box>
                                                )}
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

    const renderMonthlyReportMonitor = () => {
        if (monthlyReportLoading && !monthlyReportData) {
            return <Paper sx={{ p: 4, mb: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress size={30} /></Paper>;
        }

        if (monthlyReportError) {
            return <Alert severity="warning" sx={{ mb: 4 }}>{monthlyReportError}</Alert>;
        }

        if (!monthlyReportData) return null;

        const { settings, totals, deliveries, newsletterTotals, newsletterDeliveries } = monthlyReportData;
        const reportStatus = (status: string) => {
            if (status === 'sent') return { label: 'Versendet', color: 'success' as const };
            if (status === 'failed') return { label: 'Fehlgeschlagen', color: 'error' as const };
            if (status === 'skipped') return { label: 'Übersprungen', color: 'default' as const };
            return { label: 'In Versand', color: 'warning' as const };
        };
        const deliveryModeLabel = (mode: string) => ({ mobiliti: 'Mobiliti direkt', export: 'Zentraler Export', external: 'Extern' }[mode] || mode);
        const formatPeriod = (from: string, toExclusive: string) => {
            const end = new Date(toExclusive);
            end.setUTCDate(end.getUTCDate() - 1);
            const formatter = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeZone: 'Europe/Vienna' });
            return `${formatter.format(new Date(from))} – ${formatter.format(end)}`;
        };
        const metricDelta = (current: number, previous: number) => {
            const difference = current - previous;
            if (difference === 0) return { label: '±0', color: 'default' as const };
            return {
                label: `${difference > 0 ? '+' : ''}${difference}`,
                color: difference > 0 ? 'success' as const : 'error' as const,
            };
        };
        const roleLabel = (role: string) => role === 'assistenz' ? 'Assistenz' : 'Admin';

        return (
            <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <EmailOutlinedIcon color="primary" /> Monatlicher E-Mail-Report
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <Button
                            size="small"
                            variant="contained"
                            startIcon={monthlyPreviewLoading ? <CircularProgress size={16} color="inherit" /> : <VisibilityOutlinedIcon />}
                            onClick={handlePreviewMonthlyReport}
                            disabled={monthlyPreviewLoading}
                        >
                            Report simulieren
                        </Button>
                        <Button size="small" startIcon={<RefreshIcon />} onClick={fetchMonthlyReportData} disabled={monthlyReportLoading}>Aktualisieren</Button>
                    </Box>
                </Box>

                {settings && !settings.allow_automated_newsletter && (
                    <Alert severity="warning" sx={{ mb: 2 }}>Der automatische Newsletter-Versand ist für {settings.name} deaktiviert.</Alert>
                )}
                {settings && settings.allow_automated_newsletter && Number(settings.eligible_recipients) === 0 && (
                    <Alert severity="info" sx={{ mb: 2 }}>Kein aktiver Admin oder Assistent hat derzeit ein Newsletter-Opt-in. Es wird kein Monatsreport versendet.</Alert>
                )}

                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={6} md={3}><Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">Versandbereite Empfänger</Typography><Typography variant="h5" fontWeight="bold">{settings?.eligible_recipients || 0} / {settings?.configured_recipients || 0}</Typography></Paper></Grid>
                    <Grid item xs={12} sm={6} md={3}><Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">Versendet</Typography><Typography variant="h5" fontWeight="bold" color="success.main">{totals.sent}</Typography></Paper></Grid>
                    <Grid item xs={12} sm={6} md={3}><Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">Fehlgeschlagen</Typography><Typography variant="h5" fontWeight="bold" color="error.main">{totals.failed}</Typography></Paper></Grid>
                    <Grid item xs={12} sm={6} md={3}><Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">In Verarbeitung</Typography><Typography variant="h5" fontWeight="bold" color="warning.main">{totals.sending}</Typography></Paper></Grid>
                </Grid>

                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Berichtsmonat</TableCell>
                                <TableCell>Empfänger</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Zeitpunkt</TableCell>
                                <TableCell>Hinweis</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {deliveries.map((delivery) => {
                                const status = reportStatus(delivery.status);
                                const timestamp = delivery.sent_at || delivery.failed_at || delivery.created_at;
                                return (
                                    <TableRow key={delivery.id} hover>
                                        <TableCell>{new Date(delivery.report_month).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })}</TableCell>
                                        <TableCell>{delivery.recipient_name || delivery.email}<Typography variant="caption" display="block" color="text.secondary">{delivery.recipient_name ? delivery.email : ''}</Typography></TableCell>
                                        <TableCell><Chip label={status.label} color={status.color} variant="outlined" size="small" /></TableCell>
                                        <TableCell>{formatDate(timestamp)}</TableCell>
                                        <TableCell sx={{ maxWidth: 360 }}><Typography variant="caption" color={delivery.error_message ? 'error' : 'text.secondary'}>{delivery.error_message || '—'}</Typography></TableCell>
                                    </TableRow>
                                );
                            })}
                            {deliveries.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}>Noch kein Monatsreport-Versand protokolliert.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Box sx={{ mt: 4, mb: 2 }}>
                    <Typography variant="h5" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <EmailOutlinedIcon color="primary" /> Mobiliti Branchenbriefing
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Modus: {deliveryModeLabel(settings?.newsletter_delivery_mode || 'mobiliti')} · Frequenz: {settings?.newsletter_frequency || 'never'} · Direktlimit: {settings?.newsletter_recipient_limit || 250}
                    </Typography>
                </Box>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={6} md={3}><Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">Bestätigte Briefing-Empfänger</Typography><Typography variant="h5" fontWeight="bold">{settings?.briefing_recipients || 0}</Typography></Paper></Grid>
                    <Grid item xs={12} sm={6} md={3}><Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">Versendet (30 Tage)</Typography><Typography variant="h5" fontWeight="bold" color="success.main">{newsletterTotals?.sent || 0}</Typography></Paper></Grid>
                    <Grid item xs={12} sm={6} md={3}><Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">Fehlgeschlagen (30 Tage)</Typography><Typography variant="h5" fontWeight="bold" color="error.main">{newsletterTotals?.failed || 0}</Typography></Paper></Grid>
                    <Grid item xs={12} sm={6} md={3}><Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography variant="caption" color="text.secondary">Übersprungen / läuft</Typography><Typography variant="h5" fontWeight="bold">{(newsletterTotals?.skipped || 0) + (newsletterTotals?.sending || 0)}</Typography></Paper></Grid>
                </Grid>

                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table size="small">
                        <TableHead><TableRow><TableCell>Empfänger</TableCell><TableCell>Modus</TableCell><TableCell>Status</TableCell><TableCell>Zeitpunkt</TableCell><TableCell>Hinweis</TableCell></TableRow></TableHead>
                        <TableBody>
                            {(newsletterDeliveries || []).map((delivery) => {
                                const status = reportStatus(delivery.status);
                                const timestamp = delivery.sent_at || delivery.failed_at || delivery.created_at;
                                return <TableRow key={delivery.id} hover>
                                    <TableCell>{delivery.recipient_email}</TableCell>
                                    <TableCell>{deliveryModeLabel(delivery.delivery_mode)}</TableCell>
                                    <TableCell><Chip label={status.label} color={status.color} variant="outlined" size="small" /></TableCell>
                                    <TableCell>{formatDate(timestamp)}</TableCell>
                                    <TableCell sx={{ maxWidth: 360 }}><Typography variant="caption" color={delivery.error_message ? 'error' : 'text.secondary'}>{delivery.error_message || '—'}</Typography></TableCell>
                                </TableRow>;
                            })}
                            {(newsletterDeliveries || []).length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}>Noch kein Branchenbriefing-Versand protokolliert.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Dialog
                    open={monthlyPreviewOpen}
                    onClose={() => !monthlyPreviewLoading && setMonthlyPreviewOpen(false)}
                    fullWidth
                    maxWidth="md"
                >
                    <DialogTitle sx={{ pr: 7 }}>
                        Monatsreport simulieren
                        <IconButton
                            aria-label="Vorschau schließen"
                            onClick={() => setMonthlyPreviewOpen(false)}
                            disabled={monthlyPreviewLoading}
                            sx={{ position: 'absolute', right: 8, top: 8 }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent dividers>
                        {monthlyPreviewLoading && (
                            <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <CircularProgress />
                                <Typography color="text.secondary">Kennzahlen und berechtigte Empfänger werden ermittelt …</Typography>
                            </Box>
                        )}
                        {monthlyPreviewError && <Alert severity="error">{monthlyPreviewError}</Alert>}
                        {monthlyPreview?.partner && monthlyPreview?.stats && !monthlyPreviewLoading && (
                            <Box>
                                <Alert severity="info" sx={{ mb: 3 }}>
                                    Reine Simulation: Es wurde keine E-Mail versendet und kein Versandauftrag angelegt.
                                </Alert>

                                <Typography variant="h6" fontWeight="bold">{monthlyPreview.partner.name}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{monthlyPreview.subject}</Typography>

                                {!monthlyPreview.partner.allowAutomatedNewsletter && (
                                    <Alert severity="warning" sx={{ mb: 2 }}>
                                        Der automatische Monatsreport ist für diesen Mandanten deaktiviert. Die Vorschau ist trotzdem verfügbar.
                                    </Alert>
                                )}

                                <Grid container spacing={2} sx={{ mb: 3 }}>
                                    <Grid item xs={12} md={6}>
                                        <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                                            <Typography variant="caption" color="text.secondary">Berichtszeitraum</Typography>
                                            <Typography fontWeight="bold">{formatPeriod(monthlyPreview.period.reportFrom, monthlyPreview.period.reportToExclusive)}</Typography>
                                        </Paper>
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                                            <Typography variant="caption" color="text.secondary">Vergleichszeitraum</Typography>
                                            <Typography fontWeight="bold">{formatPeriod(monthlyPreview.period.comparisonFrom, monthlyPreview.period.comparisonToExclusive)}</Typography>
                                        </Paper>
                                    </Grid>
                                </Grid>

                                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1.5 }}>Kennzahlen</Typography>
                                <Grid container spacing={2} sx={{ mb: 3 }}>
                                    {([
                                        ['Logins', monthlyPreview.stats.logins],
                                        ['Gelesene Inhalte', monthlyPreview.stats.reads],
                                        ['Community-Beiträge', monthlyPreview.stats.community],
                                        ['Downloads', monthlyPreview.stats.downloads],
                                    ] as Array<[string, { current: number; prev: number }]>).map(([label, metric]) => {
                                        const delta = metricDelta(metric.current, metric.prev);
                                        return (
                                            <Grid item xs={12} sm={6} md={3} key={label}>
                                                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                                                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 0.5 }}>
                                                        <Typography variant="h5" fontWeight="bold">{metric.current}</Typography>
                                                        <Chip label={delta.label} color={delta.color} size="small" variant="outlined" />
                                                    </Box>
                                                    <Typography variant="caption" color="text.secondary">Vergleich: {metric.prev}</Typography>
                                                </Paper>
                                            </Grid>
                                        );
                                    })}
                                    <Grid item xs={12}>
                                        <Paper variant="outlined" sx={{ p: 2 }}>
                                            <Typography variant="caption" color="text.secondary">Mandantenspeicher</Typography>
                                            <Typography fontWeight="bold">
                                                {monthlyPreview.stats.storage.usedMb} MB von {monthlyPreview.stats.storage.limitMb} MB ({monthlyPreview.stats.storage.percent} %)
                                            </Typography>
                                        </Paper>
                                    </Grid>
                                </Grid>

                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
                                    <Typography variant="subtitle1" fontWeight="bold">Tatsächliche Opt-in-Empfänger</Typography>
                                    <Chip label={`${monthlyPreview.recipients.length} Empfänger`} color={monthlyPreview.recipients.length ? 'success' : 'default'} variant="outlined" />
                                </Box>

                                {monthlyPreview.recipients.length === 0 ? (
                                    <Alert severity="warning">Kein aktiver Admin oder Assistent ist derzeit für den Monatsreport angemeldet.</Alert>
                                ) : (
                                    <TableContainer component={Paper} variant="outlined">
                                        <Table size="small">
                                            <TableHead><TableRow><TableCell>Name</TableCell><TableCell>E-Mail</TableCell><TableCell>Rolle</TableCell></TableRow></TableHead>
                                            <TableBody>
                                                {monthlyPreview.recipients.map((recipient) => {
                                                    const name = `${recipient.firstName} ${recipient.lastName}`.trim();
                                                    return (
                                                        <TableRow key={recipient.id}>
                                                            <TableCell>{name || '—'}</TableCell>
                                                            <TableCell>{recipient.email}</TableCell>
                                                            <TableCell><Chip label={roleLabel(recipient.role)} size="small" variant="outlined" /></TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setMonthlyPreviewOpen(false)} disabled={monthlyPreviewLoading}>Schließen</Button>
                    </DialogActions>
                </Dialog>
            </Box>
        );
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
                Admin Aktivitätsmonitor
            </Typography>

            {renderHealthWidget()}

            {renderMonthlyReportMonitor()}

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
                                    <TableRow key={log.id} hover sx={{ cursor: 'pointer' }} onClick={() => handleSelectLog(log)}>
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
            <Dialog open={!!selectedLog} onClose={handleCloseLogDetails} fullWidth maxWidth="md">
                <DialogTitle>
                    Log-Details
                    <IconButton aria-label="close" onClick={handleCloseLogDetails} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton>
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
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 'bold' }}>Benutzerprofil</Typography>

                                {selectedLogUserLoading && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                                        <CircularProgress size={22} />
                                        <Typography variant="body2" color="text.secondary">Profildaten werden geladen …</Typography>
                                    </Box>
                                )}

                                {!selectedLogUserLoading && selectedLogUserMessage && (
                                    <Alert severity="info">{selectedLogUserMessage}</Alert>
                                )}

                                {!selectedLogUserLoading && selectedLogUser && (
                                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
                                            <Avatar
                                                src={resolveAssetUrl(selectedLogUser.profile_image_url)}
                                                alt={`${selectedLogUser.first_name || ''} ${selectedLogUser.last_name || ''}`.trim() || selectedLogUser.username}
                                                sx={{ width: 64, height: 64 }}
                                            >
                                                {(selectedLogUser.first_name?.[0] || selectedLogUser.username?.[0] || '?').toUpperCase()}
                                            </Avatar>
                                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                                <Typography variant="h6" sx={{ lineHeight: 1.25 }}>
                                                    {[selectedLogUser.first_name, selectedLogUser.last_name].filter(Boolean).join(' ') || selectedLogUser.username}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">@{selectedLogUser.username}</Typography>
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                                                    {selectedLogUser.role && <Chip label={`Rolle: ${selectedLogUser.role}`} size="small" />}
                                                    <Chip
                                                        label={selectedLogUser.is_active ? 'Aktiv' : 'Inaktiv'}
                                                        color={selectedLogUser.is_active ? 'success' : 'default'}
                                                        size="small"
                                                        variant="outlined"
                                                    />
                                                    {selectedLogUser.membership_level && <Chip label={selectedLogUser.membership_level} size="small" variant="outlined" />}
                                                </Box>
                                            </Box>
                                        </Box>

                                        <Grid container spacing={1.5}>
                                            {selectedLogUser.organization_name && (
                                                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Organisation:</strong> {selectedLogUser.organization_name}</Typography></Grid>
                                            )}
                                            {selectedLogUser.business_partner_name && (
                                                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Mandant:</strong> {selectedLogUser.business_partner_name}</Typography></Grid>
                                            )}
                                            {selectedLogUser.email && (
                                                <Grid item xs={12} sm={6}>
                                                    <Typography variant="body2"><strong>E-Mail:</strong> <Link href={`mailto:${selectedLogUser.email}`}>{selectedLogUser.email}</Link></Typography>
                                                </Grid>
                                            )}
                                            {selectedLogUser.phone && (
                                                <Grid item xs={12} sm={6}>
                                                    <Typography variant="body2"><strong>Telefon:</strong> <Link href={`tel:${selectedLogUser.phone}`}>{selectedLogUser.phone}</Link></Typography>
                                                </Grid>
                                            )}
                                            {selectedLogUser.created_at && (
                                                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Registriert seit:</strong> {formatDate(selectedLogUser.created_at)}</Typography></Grid>
                                            )}
                                            {selectedLogUser.last_login_at && (
                                                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Letzter Login:</strong> {formatDate(selectedLogUser.last_login_at)}</Typography></Grid>
                                            )}
                                            {selectedLogUser.active_until && (
                                                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Aktiv bis:</strong> {formatDate(selectedLogUser.active_until)}</Typography></Grid>
                                            )}
                                            {selectedLogUser.login_count != null && (
                                                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Logins:</strong> {selectedLogUser.login_count}</Typography></Grid>
                                            )}
                                            {selectedLogUser.contribution_score != null && (
                                                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Community-Punkte:</strong> {selectedLogUser.contribution_score}</Typography></Grid>
                                            )}
                                            <Grid item xs={12} sm={6}>
                                                <Typography variant="body2"><strong>Newsletter:</strong> {selectedLogUser.newsletter_opt_in ? 'angemeldet' : 'nicht angemeldet'}</Typography>
                                            </Grid>
                                        </Grid>

                                        {!!selectedLogUser.tags?.length && (
                                            <Box sx={{ mt: 2 }}>
                                                <Typography variant="body2" sx={{ mb: 0.75 }}><strong>Experte für:</strong></Typography>
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                                                    {selectedLogUser.tags.map((tag) => <Chip key={tag} label={tag} size="small" color="primary" variant="outlined" />)}
                                                </Box>
                                            </Box>
                                        )}

                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                                            <Button
                                                component="a"
                                                href={`/p/${selectedLogUser.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                size="small"
                                                variant="outlined"
                                                endIcon={<OpenInNewIcon />}
                                            >
                                                Visitenkarte öffnen
                                            </Button>
                                            {safeExternalUrl(selectedLogUser.linkedin_url) && (
                                                <Button
                                                    component="a"
                                                    href={safeExternalUrl(selectedLogUser.linkedin_url)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    size="small"
                                                    variant="text"
                                                    endIcon={<OpenInNewIcon />}
                                                >
                                                    LinkedIn
                                                </Button>
                                            )}
                                        </Box>
                                    </Paper>
                                )}
                            </Grid>
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
                <DialogActions><Button onClick={handleCloseLogDetails}>Schließen</Button></DialogActions>
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
