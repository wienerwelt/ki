// frontend/src/pages/FileManagementPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Button, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    IconButton, Tooltip, TextField, InputAdornment
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';

// Icons
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';

// Interface for a file object from the API
interface PartnerFile {
    id: string;
    filename: string;
    file_type: string;
    file_size: number;
    created_at: string;
}

const FileManagementPage: React.FC = () => {
    const { user } = useAuth();
    const [files, setFiles] = useState<PartnerFile[]>([]);
    const [filteredFiles, setFilteredFiles] = useState<PartnerFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [uploading, setUploading] = useState(false);

    // Check if the user has upload/delete permissions
    const isUploader = user?.role === 'admin' || user?.role === 'assistenz';

    // Function to fetch files from the backend
    const fetchFiles = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/files', {
                headers: { 'x-auth-token': token }
            });
            setFiles(response.data);
            setFilteredFiles(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Dateien.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    // Search functionality filters files based on the search term
    useEffect(() => {
        const results = files.filter(file =>
            file.filename.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredFiles(results);
    }, [searchTerm, files]);

    // Handler for file upload
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
            await fetchFiles(); // Refresh the file list after upload
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Hochladen der Datei.');
        } finally {
            setUploading(false);
        }
    };

    // Handler for file download
    const handleFileDownload = async (fileId: string, filename: string) => {
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get(`/api/files/${fileId}/download`, {
                headers: { 'x-auth-token': token }
            });
            const { url } = response.data;
            // Create a temporary link to trigger the browser download
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

    // Handler for file deletion
    const handleFileDelete = async (fileId: string) => {
        if (window.confirm('Sind Sie sicher, dass Sie diese Datei endgültig löschen möchten?')) {
            try {
                const token = localStorage.getItem('jwt_token');
                await apiClient.delete(`/api/files/${fileId}`, {
                    headers: { 'x-auth-token': token }
                });
                await fetchFiles(); // Refresh the file list after deletion
            } catch (err: any) {
                setError(err.response?.data?.message || 'Fehler beim Löschen der Datei.');
            }
        }
    };

    // Helper to format file size into a readable format
    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" gutterBottom>Dateiverzeichnis</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Hier finden Sie alle relevanten Dokumente und Dateien, die für Sie bereitgestellt wurden.
            </Typography>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <TextField
                        variant="outlined"
                        size="small"
                        placeholder="Dateien durchsuchen..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            ),
                        }}
                        sx={{ minWidth: '300px' }}
                    />
                    {isUploader && (
                        <Button
                            variant="contained"
                            component="label"
                            startIcon={<UploadFileIcon />}
                            disabled={uploading}
                        >
                            {uploading ? 'Lädt hoch...' : 'Datei hochladen'}
                            <input type="file" hidden onChange={handleFileUpload} />
                        </Button>
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
                                <TableCell>Dateiname</TableCell>
                                <TableCell>Typ</TableCell>
                                <TableCell align="right">Größe</TableCell>
                                <TableCell align="right">Hochgeladen am</TableCell>
                                <TableCell align="center">Aktionen</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredFiles.length > 0 ? filteredFiles.map((file) => (
                                <TableRow key={file.id} hover>
                                    <TableCell component="th" scope="row">{file.filename}</TableCell>
                                    <TableCell>{file.file_type}</TableCell>
                                    <TableCell align="right">{formatFileSize(file.file_size)}</TableCell>
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
                                    <TableCell colSpan={5} align="center">
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
