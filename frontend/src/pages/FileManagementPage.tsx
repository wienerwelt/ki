// frontend/src/pages/FileManagementPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Button, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    IconButton, Tooltip, TextField, InputAdornment, LinearProgress, TableSortLabel, Chip
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';

// Icons
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import StorageIcon from '@mui/icons-material/Storage';

// --- Interfaces & Typen ---
interface PartnerFile {
    id: string;
    filename: string;
    file_type: string;
    file_size: number;
    created_at: string;
    business_partner_name?: string; // Optional, nur für Admins
}

type Order = 'asc' | 'desc';

// --- Helper Functions ---
const formatFileSize = (bytes: number | null | undefined, decimals = 2) => {
    if (bytes == null || bytes <= 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// === KORREKTUR START: Typsicherheit der Sortierfunktionen verbessert ===
function descendingComparator(a: PartnerFile, b: PartnerFile, orderBy: keyof PartnerFile) {
    const valA = a[orderBy] ?? '';
    const valB = b[orderBy] ?? '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
    return 0;
}

function getComparator(
    order: Order,
    orderBy: keyof PartnerFile,
): (a: PartnerFile, b: PartnerFile) => number {
    return order === 'desc'
        ? (a, b) => descendingComparator(a, b, orderBy)
        : (a, b) => -descendingComparator(a, b, orderBy);
}
// === KORREKTUR ENDE ===


const FileManagementPage: React.FC = () => {
    const { user, businessPartner, fetchBusinessPartnerData } = useAuth();
    const [files, setFiles] = useState<PartnerFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [uploading, setUploading] = useState(false);
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof PartnerFile>('created_at');

    const isAdmin = user?.role === 'admin';
    const isUploader = user?.role === 'admin' || user?.role === 'assistenz';

    const fetchFiles = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/files', {
                headers: { 'x-auth-token': token }
            });
            setFiles(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Dateien.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);
    
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setError(null);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const token = localStorage.getItem('jwt_token');
            await apiClient.post('/api/files/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'x-auth-token': token
                }
            });
            await fetchFiles();
            await fetchBusinessPartnerData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Hochladen der Datei.');
        } finally {
            setUploading(false);
        }
    };
    
    const handleFileDelete = async (fileId: string) => {
        if (window.confirm('Sind Sie sicher, dass Sie diese Datei endgültig löschen möchten?')) {
            try {
                const token = localStorage.getItem('jwt_token');
                await apiClient.delete(`/api/files/${fileId}`, {
                    headers: { 'x-auth-token': token }
                });
                await fetchFiles();
                await fetchBusinessPartnerData();
            } catch (err: any) {
                setError(err.response?.data?.message || 'Fehler beim Löschen der Datei.');
            }
        }
    };
    
    const handleFileDownload = async (fileId: string, filename: string) => {
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get(`/api/files/${fileId}/download`, {
                headers: { 'x-auth-token': token }
            });
            const { url } = response.data;
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Herunterladen der Datei.');
        }
    };

    const handleSortRequest = (property: keyof PartnerFile) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const sortedAndFilteredFiles = useMemo(() => {
        const lowercasedFilter = searchTerm.toLowerCase();
        let filtered = files.filter(file =>
            file.filename.toLowerCase().includes(lowercasedFilter) ||
            (isAdmin && file.business_partner_name?.toLowerCase().includes(lowercasedFilter))
        );
        return filtered.sort(getComparator(order, orderBy));
    }, [files, searchTerm, order, orderBy, isAdmin]);

    const usageBytes = businessPartner?.storage_usage_bytes ?? 0;
    const limitBytes = businessPartner?.storage_limit_bytes ?? 0;
    const usagePercent = limitBytes > 0 ? (Math.max(0, usageBytes) / limitBytes) * 100 : 0;
    const storageTier = businessPartner?.storage_tier || 'free';
    const isStorageFull = usageBytes >= limitBytes;
    const canUpload = isUploader && storageTier !== 'free' && !isStorageFull;

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>Dateiverzeichnis</Typography>
            
            {isUploader && businessPartner && (
                <Paper sx={{ p: 2, mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <StorageIcon color="action" />
                        <Typography variant="body1" sx={{ flexGrow: 1 }}>
                            Speicherplatz (Paket: <strong>{storageTier}</strong>)
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {`${formatFileSize(usageBytes)} / ${formatFileSize(limitBytes)} (${usagePercent.toFixed(1)}%)`}
                        </Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={usagePercent} />
                </Paper>
            )}

            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <TextField
                        variant="outlined" size="small" 
                        placeholder={isAdmin ? "Dateien oder Partner suchen..." : "Dateien durchsuchen..."}
                        value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>), }}
                        sx={{ minWidth: '300px' }}
                    />
                    {isUploader && (
                        <Tooltip title={!canUpload ? "Speicherlimit erreicht oder Ihr Paket erlaubt keine Uploads." : ""}>
                           <span>
                                <Button
                                    variant="contained" component="label" startIcon={<UploadFileIcon />}
                                    disabled={!canUpload || uploading}
                                >
                                    {uploading ? 'Lädt hoch...' : 'Datei hochladen'}
                                    <input type="file" hidden onChange={handleFileUpload} />
                                </Button>
                            </span>
                        </Tooltip>
                    )}
                </Box>
            </Paper>

            {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}><CircularProgress /></Box>}
            {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}

            {!loading && (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sortDirection={orderBy === 'filename' ? order : false}>
                                    <TableSortLabel active={orderBy === 'filename'} direction={order} onClick={() => handleSortRequest('filename')}>
                                        Dateiname
                                    </TableSortLabel>
                                </TableCell>
                                {isAdmin && (
                                    <TableCell sortDirection={orderBy === 'business_partner_name' ? order : false}>
                                        <TableSortLabel active={orderBy === 'business_partner_name'} direction={order} onClick={() => handleSortRequest('business_partner_name')}>
                                            Business Partner
                                        </TableSortLabel>
                                    </TableCell>
                                )}
                                <TableCell sortDirection={orderBy === 'file_type' ? order : false}>
                                    <TableSortLabel active={orderBy === 'file_type'} direction={order} onClick={() => handleSortRequest('file_type')}>
                                        Typ
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="right" sortDirection={orderBy === 'file_size' ? order : false}>
                                    <TableSortLabel active={orderBy === 'file_size'} direction={order} onClick={() => handleSortRequest('file_size')}>
                                        Größe
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="right" sortDirection={orderBy === 'created_at' ? order : false}>
                                    <TableSortLabel active={orderBy === 'created_at'} direction={order} onClick={() => handleSortRequest('created_at')}>
                                        Hochgeladen am
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell align="center">Aktionen</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sortedAndFilteredFiles.length > 0 ? sortedAndFilteredFiles.map((file) => (
                                <TableRow key={file.id} hover>
                                    <TableCell component="th" scope="row">{file.filename}</TableCell>
                                    {isAdmin && (
                                        <TableCell>
                                            <Chip label={file.business_partner_name} size="small" />
                                        </TableCell>
                                    )}
                                    <TableCell>{file.file_type}</TableCell>
                                    <TableCell align="right">{formatFileSize(file.file_size, 2)}</TableCell>
                                    <TableCell align="right">{new Date(file.created_at).toLocaleDateString('de-DE')}</TableCell>
                                    <TableCell align="center">
                                        <Tooltip title="Herunterladen">
                                            <IconButton onClick={() => handleFileDownload(file.id, file.filename)}>
                                                <DownloadIcon />
                                            </IconButton>
                                        </Tooltip>
                                        {isUploader && (
                                            <Tooltip title="Löschen">
                                                <IconButton onClick={() => handleFileDelete(file.id)}>
                                                    <DeleteIcon color="error" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={isAdmin ? 6 : 5} align="center">
                                        <Typography color="text.secondary" sx={{ p: 3 }}>
                                            {searchTerm ? 'Keine Dateien für Ihre Suche gefunden.' : 'Es wurden noch keine Dateien hochgeladen.'}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
};

export default FileManagementPage;
