// frontend/src/components/widgets/FileDownloadWidget.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Box, Typography, Grid, Paper, IconButton, Tooltip, TextField, 
    InputAdornment, Chip, FormControl, InputLabel, Select, MenuItem,
    List, ListItem, ListItemIcon, ListItemText, SelectChangeEvent, 
    ToggleButtonGroup, ToggleButton, Stack
} from '@mui/material';
import { BaseWidgetProps } from '../../types/dashboard.types';
import WidgetPaper from './WidgetPaper';
import apiClient from '../../apiClient';

// Icons
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import FolderIcon from '@mui/icons-material/Folder';
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha';
import EventIcon from '@mui/icons-material/Event';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionIcon from '@mui/icons-material/Description';
import AssessmentIcon from '@mui/icons-material/Assessment';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

// --- Interfaces & Typen (unverändert) ---
interface PartnerFile { id: string; filename: string; file_type: string; file_size: number; created_at: string; description?: string; tags?: string[]; download_count?: number; }
interface FileDownloadWidgetProps extends BaseWidgetProps { title: string; widgetTypeKey: string; }
type SortOrder = 'asc' | 'desc';
type SortBy = 'filename' | 'created_at' | 'download_count';
type ViewMode = 'tiles' | 'list';

// --- Hilfsfunktionen ---
const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return <PictureAsPdfIcon sx={{ fontSize: 30, color: '#D32F2F' }} />;
    if (fileType.includes('image')) return <ImageIcon sx={{ fontSize: 30, color: '#388E3C' }} />;
    if (fileType.includes('word')) return <DescriptionIcon sx={{ fontSize: 30, color: '#1976D2' }} />;
    if (fileType.includes('sheet') || fileType.includes('csv')) return <AssessmentIcon sx={{ fontSize: 30, color: '#0288D1' }} />;
    return <InsertDriveFileIcon sx={{ fontSize: 30, color: 'text.secondary' }} />;
};
const formatFileSize = (bytes: number) => {
    if (bytes <= 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
const removeFileExtension = (filename: string) => filename.replace(/\.[^/.]+$/, "");

// --- Hilfskomponenten ---
const FileCard: React.FC<{ file: PartnerFile, onDownload: (id: string) => void }> = ({ file, onDownload }) => (
    <Grid item xs={12} sm={6} md={4} lg={3}>
        <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                {getFileIcon(file.file_type)}
                <Typography variant="subtitle1" sx={{ flexGrow: 1, wordBreak: 'break-word', fontWeight: 'bold' }}>{file.filename}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1, minHeight: '40px' }}>{file.description || `Hochgeladen am ${new Date(file.created_at).toLocaleDateString('de-DE')}`}</Typography>
            {/* KORREKTUR: Das überflüssige '<' vor der geschweiften Klammer wurde entfernt */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, my: 1 }}>{(file.tags || []).map(tag => <Chip key={tag} label={tag} size="small" />)}</Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">{formatFileSize(file.file_size)}</Typography>
                {file.download_count !== undefined && (<Typography variant="caption" color="text.secondary">{file.download_count} Downloads</Typography>)}
                <Tooltip title="Herunterladen"><IconButton onClick={() => onDownload(file.id)}><DownloadIcon /></IconButton></Tooltip>
            </Box>
        </Paper>
    </Grid>
);

const FileListItem: React.FC<{ file: PartnerFile, onDownload: (id: string) => void }> = ({ file, onDownload }) => {
    const primaryText = file.description ? file.description : removeFileExtension(file.filename);
    const showFilenameAsSecondary = !!file.description;
    return (
        <ListItem secondaryAction={<Tooltip title="Herunterladen"><IconButton edge="end" onClick={() => onDownload(file.id)}><DownloadIcon /></IconButton></Tooltip>}>
            <ListItemIcon>{getFileIcon(file.file_type)}</ListItemIcon>
            <ListItemText
                primary={primaryText}
                secondary={
                    <Stack component="span">
                        {showFilenameAsSecondary && (<Typography component="span" variant="body2" color="text.primary">{file.filename}</Typography>)}
                        <Typography component="span" variant="caption">{`Größe: ${formatFileSize(file.file_size)}${file.download_count !== undefined ? ` • ${file.download_count} Downloads` : ''} • ${new Date(file.created_at).toLocaleDateString('de-DE')}`}</Typography>
                    </Stack>
                }
            />
        </ListItem>
    );
};

// --- Hauptkomponente ---
const FileDownloadWidget: React.FC<FileDownloadWidgetProps> = ({ onDelete, widgetId, isRemovable, title, widgetTypeKey }) => {
    const [files, setFiles] = useState<PartnerFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<SortBy>('created_at');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const errorTimeoutRef = useRef<number | null>(null);

    useEffect(() => () => { if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current); }, []);

    const fetchFiles = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('jwt_token');
            const response = await apiClient.get('/api/files', { headers: { 'x-auth-token': token } });
            setFiles(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Fehler beim Laden der Dateien.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchFiles(); }, [fetchFiles]);

const handleFileDownload = useCallback(async (fileId: string) => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    setError(null);

    try {
        const token = localStorage.getItem('jwt_token');
        // 1. Sichere S3-Download-URL vom Backend anfordern
        const urlResponse = await apiClient.get(`/api/files/${fileId}/download`, {
            headers: { 'x-auth-token': token }
        });
        const { url } = urlResponse.data;

        // 2. Die URL direkt in einem neuen Tab öffnen
        window.open(url, '_blank');

        // 3. Den Download-Zähler im Hintergrund aktualisieren
        await apiClient.post(`/api/files/${fileId}/track-download`, {}, {
            headers: { 'x-auth-token': token }
        });

        // 4. Dateiliste neu laden, um den aktualisierten Zähler anzuzeigen
        fetchFiles();

    } catch (err: any) {
        const errorMessage = err.response?.data?.message || 'Fehler beim Herunterladen der Datei.';
        setError(errorMessage);
        errorTimeoutRef.current = setTimeout(() => setError(null), 5000);
    }
}, [fetchFiles]);

    const handleSortChange = (event: SelectChangeEvent<SortBy>) => setSortBy(event.target.value as SortBy);
    const handleSortOrderChange = () => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    const handleViewModeChange = (_: React.MouseEvent<HTMLElement>, newViewMode: ViewMode | null) => { if (newViewMode) setViewMode(newViewMode); };

const sortedAndFilteredFiles = useMemo(() => {
    const lowercasedSearchTerm = searchTerm.toLowerCase();
    const filtered = files.filter(file =>
        file.filename.toLowerCase().includes(lowercasedSearchTerm) ||
        (file.description || '').toLowerCase().includes(lowercasedSearchTerm) ||
        file.tags?.some(tag => tag.toLowerCase().includes(lowercasedSearchTerm))
    );

    return filtered.sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
            case 'filename':
                comparison = a.filename.localeCompare(b.filename);
                break;
            case 'created_at':
                comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                break;
            case 'download_count':
                comparison = (a.download_count ?? 0) - (b.download_count ?? 0);
                break;
            default:
                comparison = 0;
        }
        
        // Wenn die Sortierrichtung 'desc' (absteigend) ist, kehren wir das Ergebnis um.
        return sortOrder === 'desc' ? comparison * -1 : comparison;
    });
}, [files, searchTerm, sortBy, sortOrder]);

    return (
        <WidgetPaper
            title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FolderIcon />
                    <Typography variant="h6">{title}</Typography>
                </Box>
            }
            widgetId={widgetId}
            onDelete={onDelete}
            isRemovable={isRemovable}
            widgetTitle={title}
            widgetTypeKey={widgetTypeKey}
            loading={loading}
            error={error}
            noPadding={true}
        >
            <Box sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mb: 2 }}>
                    <TextField fullWidth variant="outlined" size="small" placeholder="Dokumente durchsuchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>)}}/>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexShrink: 0 }}>
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>Sortieren</InputLabel>
                            <Select value={sortBy} label="Sortieren" onChange={handleSortChange}>
                                <MenuItem value="created_at"><EventIcon sx={{ mr: 1, fontSize: '1rem' }}/>Datum</MenuItem>
                                <MenuItem value="filename"><SortByAlphaIcon sx={{ mr: 1, fontSize: '1rem' }}/>Name</MenuItem>
                                <MenuItem value="download_count"><CloudDownloadIcon sx={{ mr: 1, fontSize: '1rem' }}/>Downloads</MenuItem>
                            </Select>
                        </FormControl>
                        <Tooltip title={sortOrder === 'asc' ? 'Aufsteigend' : 'Absteigend'}><IconButton onClick={handleSortOrderChange}>{sortOrder === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />}</IconButton></Tooltip>
                        <ToggleButtonGroup value={viewMode} exclusive onChange={handleViewModeChange} size="small">
                            <ToggleButton value="tiles"><Tooltip title="Kachelansicht"><ViewModuleIcon /></Tooltip></ToggleButton>
                            <ToggleButton value="list"><Tooltip title="Listenansicht"><ViewListIcon /></Tooltip></ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                </Box>

                <Box>
                    {viewMode === 'tiles' ? (
                        <Grid container spacing={2}>
                            {sortedAndFilteredFiles.length > 0 ? (
                                sortedAndFilteredFiles.map(file => <FileCard key={file.id} file={file} onDownload={handleFileDownload} />)
                            ) : (<Grid item xs={12}><Typography sx={{ textAlign: 'center', p: 3, color: 'text.secondary' }}>{searchTerm ? 'Keine Dokumente für Ihre Suche gefunden.' : 'Es sind keine Dokumente verfügbar.'}</Typography></Grid>)}
                        </Grid>
                    ) : (
                        <Paper variant="outlined">
                            <List>
                                {sortedAndFilteredFiles.length > 0 ? (
                                    sortedAndFilteredFiles.map(file => <FileListItem key={file.id} file={file} onDownload={handleFileDownload} />)
                                ) : (<Typography sx={{ textAlign: 'center', p: 3, color: 'text.secondary' }}>{searchTerm ? 'Keine Dokumente für Ihre Suche gefunden.' : 'Es sind keine Dokumente verfügbar.'}</Typography>)}
                            </List>
                        </Paper>
                    )}
                </Box>
            </Box>
        </WidgetPaper>
    );
};

export default FileDownloadWidget;