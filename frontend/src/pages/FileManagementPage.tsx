import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  IconButton, Tooltip, TextField, InputAdornment, LinearProgress, TableSortLabel, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle, Stack,
  Select, MenuItem, FormControl, InputLabel, DialogContentText,
  useTheme, useMediaQuery, Card, CardContent, CardActions, Divider
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

// Icons
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import StorageIcon from '@mui/icons-material/Storage';
import ShareIcon from '@mui/icons-material/Share';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionIcon from '@mui/icons-material/Description';
import AssessmentIcon from '@mui/icons-material/Assessment';

interface PartnerFile {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
  business_partner_name?: string;
  description?: string | null;
  tags?: string[] | null;
}
interface BusinessPartner {
  id: string;
  name: string;
  storage_usage_bytes?: number;
  storage_limit_bytes?: number;
}
interface Category { id: string; name: string; }

type Order = 'asc' | 'desc';
const formatFileSize = (bytes: number | null | undefined, decimals = 2) => {
  if (bytes == null || bytes <= 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getFileIcon = (fileType: string) => {
  if (!fileType) return <InsertDriveFileIcon color="action" />;
  if (fileType.includes('pdf')) return <PictureAsPdfIcon sx={{ color: '#D32F2F' }} />;
  if (fileType.includes('image')) return <ImageIcon sx={{ color: '#388E3C' }} />;
  if (fileType.includes('word') || fileType.includes('document')) return <DescriptionIcon sx={{ color: '#1976D2' }} />;
  if (fileType.includes('sheet') || fileType.includes('csv') || fileType.includes('excel')) return <AssessmentIcon sx={{ color: '#0288D1' }} />;
  return <InsertDriveFileIcon color="action" />;
};

function descendingComparator(a: PartnerFile, b: PartnerFile, orderBy: keyof PartnerFile) {
  const valA = (a[orderBy] as any) ?? '';
  const valB = (b[orderBy] as any) ?? '';
  if (valB < valA) return -1;
  if (valB > valA) return 1;
  return 0;
}
function getComparator(order: Order, orderBy: keyof PartnerFile): (a: PartnerFile, b: PartnerFile) => number {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

const FileManagementPage: React.FC = () => {
  const { user, businessPartner, fetchBusinessPartnerData } = useAuth();
  const { showSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [files, setFiles] = useState<PartnerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [order, setOrder] = useState<Order>('desc');
  const [orderBy, setOrderBy] = useState<keyof PartnerFile>('created_at');

  const [openUploadDialog, setOpenUploadDialog] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState('');
  const [fileTags, setFileTags] = useState('');

  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(''); 
  const [filterPartnerId, setFilterPartnerId] = useState<string>('all'); 
  const [isPartnerListLoading, setIsPartnerListLoading] = useState(false);
  
  const [shareOpen, setShareOpen] = useState(false);
  const [fileToShare, setFileToShare] = useState<PartnerFile | null>(null);
  const [shareText, setShareText] = useState('');
  const [shareCategory, setShareCategory] = useState('');
  const [sharing, setSharing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]); 

  // --- NEU: Edit State ---
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [fileToEdit, setFileToEdit] = useState<PartnerFile | null>(null);
  const [editFilename, setEditFilename] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editing, setEditing] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isAssistent = user?.role === 'assistenz';
  const isUploader = isAdmin || isAssistent;

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/files?limit=200';
      if (isAdmin && filterPartnerId !== 'all') {
          url += `&businessPartnerId=${filterPartnerId}`;
      }
      const response = await apiClient.get(url);
      setFiles(response.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Fehler beim Laden der Dateien.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, filterPartnerId]);

  const fetchPartners = useCallback(async () => {
    if (!isAdmin) return;
    setIsPartnerListLoading(true);
    try {
      const response = await apiClient.get('/api/admin/business-partners');
      setPartners(response.data || []);
    } catch (err: any) {
      setError('Fehler beim Laden der Partnerliste.');
    } finally {
      setIsPartnerListLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
      apiClient.get('/api/community/categories')
          .then(res => setCategories(res.data))
          .catch(() => {}); 
  }, []);

  useEffect(() => {
    fetchFiles();
    fetchPartners();
  }, [fetchFiles, fetchPartners]);

  // --- UPLOAD HANDLERS ---
  const handleOpenUploadDialog = () => {
    setError(null);
    setOpenUploadDialog(true);
  };
  const handleCloseUploadDialog = () => {
    setOpenUploadDialog(false);
    setFileToUpload(null);
    setFileDescription('');
    setFileTags('');
    setSelectedPartnerId('');
  };
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setFileToUpload(file);
  };
  const handleFileUpload = async () => {
    if (!fileToUpload) return;
    if (isAdmin && !selectedPartnerId) {
      setError('Bitte wählen Sie einen Business Partner aus.');
      return;
    }
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('description', fileDescription);
    formData.append('tags', fileTags);
    if (isAdmin) {
      formData.append('businessPartnerId', selectedPartnerId);
    }

    try {
      await apiClient.post('/api/files/upload', formData);
      handleCloseUploadDialog();
      await fetchFiles();
      await fetchBusinessPartnerData();
      showSnackbar('Datei erfolgreich hochgeladen.', 'success');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Fehler beim Hochladen der Datei.');
    } finally {
      setUploading(false);
    }
  };

  // --- EDIT HANDLERS (NEU) ---
  const handleOpenEditDialog = (file: PartnerFile) => {
      setFileToEdit(file);
      setEditFilename(file.filename);
      setEditDescription(file.description || '');
      setEditTags(file.tags ? file.tags.join(', ') : '');
      setOpenEditDialog(true);
  };
  const handleCloseEditDialog = () => {
      setOpenEditDialog(false);
      setFileToEdit(null);
  };
  const handleFileEdit = async () => {
      if (!fileToEdit || !editFilename.trim()) return;
      setEditing(true);
      try {
          await apiClient.put(`/api/files/${fileToEdit.id}`, {
              filename: editFilename,
              description: editDescription,
              tags: editTags
          });
          handleCloseEditDialog();
          await fetchFiles();
          showSnackbar('Datei aktualisiert.', 'success');
      } catch (err: any) {
          showSnackbar(err?.response?.data?.message || 'Fehler beim Bearbeiten.', 'error');
      } finally {
          setEditing(false);
      }
  };

  // --- DELETE & DOWNLOAD & SHARE ---
  const handleFileDelete = async (fileId: string) => {
    if (!window.confirm('Sind Sie sicher, dass Sie diese Datei endgültig löschen möchten?')) return;
    try {
      await apiClient.delete(`/api/files/${fileId}`);
      await fetchFiles();
      await fetchBusinessPartnerData();
      showSnackbar('Datei gelöscht.', 'success');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Fehler beim Löschen der Datei.');
    }
  };

  const handleFileDownload = async (fileId: string) => {
    try {
      const response = await apiClient.get(`/api/files/${fileId}/download`);
      const { url } = response.data || {};
      if (!url) throw new Error('Download-URL fehlt.');
      window.open(url, '_blank');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Fehler beim Herunterladen der Datei.');
    }
  };

  const handleOpenShare = (file: PartnerFile) => {
    setFileToShare(file);
    setShareText(`Ich habe eine neue Datei hochgeladen: ${file.filename}`);
    setShareCategory('');
    setShareOpen(true);
  };

  const handleShareToCommunity = async () => {
    if (!fileToShare) return;
    if (!shareCategory) {
        showSnackbar('Bitte wähle eine Kategorie.', 'warning');
        return;
    }
    setSharing(true);
    try {
        const urlRes = await apiClient.get(`/api/files/${fileToShare.id}/download`);
        const signedUrl = urlRes.data.url;
        const publicUrl = signedUrl.split('?')[0]; 
        await apiClient.post('/api/community/feed', { content: shareText, categoryId: shareCategory, existingFileUrl: publicUrl });
        showSnackbar('Datei erfolgreich in der Community geteilt!', 'success');
        setShareOpen(false);
    } catch (err) {
        showSnackbar('Fehler beim Teilen.', 'error');
    } finally {
        setSharing(false);
    }
  };

  const handleSortRequest = (property: keyof PartnerFile) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedAndFilteredFiles = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filtered = files.filter(file =>
      file.filename.toLowerCase().includes(lowercasedFilter) ||
      (isAdmin && file.business_partner_name?.toLowerCase().includes(lowercasedFilter)) ||
      (file.description && file.description.toLowerCase().includes(lowercasedFilter)) ||
      (file.tags && file.tags.some(tag => tag.toLowerCase().includes(lowercasedFilter)))
    );
    return filtered.sort(getComparator(order, orderBy));
  }, [files, searchTerm, order, orderBy, isAdmin]);
  
  // --- SPEICHER-ANZEIGE LOGIK ---
  let displayUsage = businessPartner?.storage_usage_bytes ?? 0;
  let displayLimit = businessPartner?.storage_limit_bytes ?? 0;
  
  // Wenn Admin einen spezifischen Partner auswählt, zeigen wir DESSEN Speicher an
  if (isAdmin && filterPartnerId !== 'all') {
      const selectedPartner = partners.find(p => p.id === filterPartnerId);
      if (selectedPartner) {
          displayUsage = selectedPartner.storage_usage_bytes ?? 0;
          displayLimit = selectedPartner.storage_limit_bytes ?? 0;
      }
  }

  const usagePercent = displayLimit > 0 ? (Math.max(0, displayUsage) / displayLimit) * 100 : 0;
  
  const canUpload = useMemo(() => {
    if (isAssistent) {
      const limit = parseInt(String(businessPartner?.storage_limit_bytes ?? 0), 10);
      const usage = parseInt(String(businessPartner?.storage_usage_bytes ?? 0), 10);
      return limit > 0 && usage < limit;
    }
    if (isAdmin) return true;
    return false;
  }, [isAdmin, isAssistent, businessPartner]);


  return (
    <Box sx={{ p: isMobile ? 1 : 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant={isMobile ? "h5" : "h4"}>Datencloud</Typography>
        {isMobile && isUploader && (
            <Tooltip title={!canUpload ? 'Speicherlimit erreicht.' : 'Hochladen'}>
                <IconButton color="primary" onClick={handleOpenUploadDialog} disabled={!canUpload} sx={{ bgcolor: 'action.hover' }}>
                    <UploadFileIcon />
                </IconButton>
            </Tooltip>
        )}
      </Box>

      {/* SPEICHER-ANZEIGE */}
      {(isAdmin || businessPartner) && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: (isAdmin && filterPartnerId === 'all') ? 0 : 1 }}>
            <StorageIcon color="action" />
            <Typography variant="body1" sx={{ flexGrow: 1 }}>
              {isAdmin 
                ? (filterPartnerId === 'all' ? 'Gesamtspeicher (Alle sichtbaren Dateien)' : 'Speicher dieses Partners')
                : `Speicher ${isMobile ? '' : `(Paket: ${businessPartner?.storage_tier || 'Basis'})`}`}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
              {files.length} Datei(en) | {' '}
              {(isAdmin && filterPartnerId === 'all')
                ? `${formatFileSize(files.reduce((acc, f) => acc + Number(f.file_size), 0))} in dieser Ansicht` 
                : `${formatFileSize(displayUsage)} / ${formatFileSize(displayLimit)}`}
            </Typography>
          </Box>
          {(!isAdmin || filterPartnerId !== 'all') && (
            <LinearProgress 
                variant="determinate" 
                value={usagePercent} 
                color={usagePercent > 90 ? 'error' : usagePercent > 75 ? 'warning' : 'success'}
                sx={{ height: 8, borderRadius: 4, bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200' }} 
            />
          )}
        </Paper>
      )}

      {/* FILTER & SUCHE */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flexGrow: 1 }}>
            <TextField
              variant="outlined"
              size="small"
              placeholder="Suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}
              fullWidth={isMobile}
              sx={{ minWidth: isMobile ? '100%' : '300px' }}
            />
            {isAdmin && (
              <FormControl size="small" sx={{ minWidth: isMobile ? '100%' : '250px' }}>
                <InputLabel>Partner filtern</InputLabel>
                <Select value={filterPartnerId} label="Partner filtern" onChange={(e) => setFilterPartnerId(e.target.value)}>
                  <MenuItem value="all"><em>Alle Partner anzeigen</em></MenuItem>
                  {partners.map(p => (
                    <MenuItem key={p.id} value={p.id}>
                        {p.name} ({formatFileSize(p.storage_usage_bytes)} / {formatFileSize(p.storage_limit_bytes)})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>

          {!isMobile && isUploader && (
            <Tooltip title={!canUpload ? 'Speicherlimit erreicht oder Paket erlaubt keine Uploads.' : ''}>
              <span>
                <Button variant="contained" startIcon={<UploadFileIcon />} disabled={!canUpload} onClick={handleOpenUploadDialog}>
                  Datei hochladen
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
      </Paper>

      {error && <Box sx={{ mb: 2 }}><Alert severity="error">{error}</Alert></Box>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}><CircularProgress /></Box>}

      {/* UPLOAD DIALOG */}
      <Dialog open={openUploadDialog} onClose={handleCloseUploadDialog} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle>Datei hochladen</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {isAdmin && (
              <FormControl fullWidth required>
                <InputLabel>Business Partner</InputLabel>
                <Select value={selectedPartnerId} label="Business Partner" onChange={(e) => setSelectedPartnerId(e.target.value as string)} disabled={isPartnerListLoading}>
                  {isPartnerListLoading && <MenuItem disabled>Lade Partner...</MenuItem>}
                  {partners.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}

            <Button variant="outlined" component="label" fullWidth sx={{ height: 100, borderStyle: 'dashed' }}>
              {fileToUpload ? fileToUpload.name : <Box sx={{textAlign:'center'}}><UploadFileIcon sx={{fontSize: 40, color: 'text.secondary'}} /><br/>Datei auswählen</Box>}
              <input type="file" hidden onChange={handleFileSelect} />
            </Button>
            <TextField label="Beschreibung" fullWidth variant="outlined" value={fileDescription} onChange={(e) => setFileDescription(e.target.value)} />
            <TextField label="Tags (Komma getrennt)" fullWidth variant="outlined" value={fileTags} onChange={(e) => setFileTags(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseUploadDialog}>Abbrechen</Button>
          <Button onClick={handleFileUpload} variant="contained" disabled={!fileToUpload || uploading}>
            {uploading ? <CircularProgress size={24} /> : 'Hochladen'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* EDIT DIALOG */}
      <Dialog open={openEditDialog} onClose={handleCloseEditDialog} fullWidth maxWidth="sm" fullScreen={isMobile}>
          <DialogTitle>Datei bearbeiten</DialogTitle>
          <DialogContent dividers>
              <Stack spacing={3} sx={{ mt: 1 }}>
                  <TextField label="Dateiname" fullWidth variant="outlined" value={editFilename} onChange={(e) => setEditFilename(e.target.value)} required />
                  <TextField label="Beschreibung" fullWidth variant="outlined" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                  <TextField label="Tags (Komma getrennt)" fullWidth variant="outlined" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
              </Stack>
          </DialogContent>
          <DialogActions>
              <Button onClick={handleCloseEditDialog}>Abbrechen</Button>
              <Button onClick={handleFileEdit} variant="contained" disabled={editing || !editFilename.trim()}>
                  {editing ? <CircularProgress size={24} /> : 'Speichern'}
              </Button>
          </DialogActions>
      </Dialog>

      {/* SHARE DIALOG */}
      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
            <DialogTitle>Datei teilen</DialogTitle>
            <DialogContent dividers>
                <DialogContentText sx={{ mb: 2 }}>Poste <strong>{fileToShare?.filename}</strong> in der Community.</DialogContentText>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField label="Nachricht" fullWidth multiline rows={3} value={shareText} onChange={(e) => setShareText(e.target.value)} />
                    <FormControl fullWidth>
                        <InputLabel>Kategorie *</InputLabel>
                        <Select value={shareCategory} label="Kategorie *" onChange={(e) => setShareCategory(e.target.value)}>
                            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setShareOpen(false)}>Abbrechen</Button>
                <Button onClick={handleShareToCommunity} variant="contained" disabled={sharing} startIcon={<ShareIcon />}>
                    {sharing ? 'Teile...' : 'Teilen'}
                </Button>
            </DialogActions>
      </Dialog>

      {!loading && (
        <>
            {/* DESKTOP TABLE VIEW */}
            {!isMobile && (
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
                            <TableSortLabel active={orderBy === 'business_partner_name'} direction={order} onClick={() => handleSortRequest('business_partner_name' as keyof PartnerFile)}>
                            Business Partner
                            </TableSortLabel>
                        </TableCell>
                        )}
                        <TableCell>Beschreibung</TableCell>
                        <TableCell>Tags</TableCell>
                        <TableCell align="right" sortDirection={orderBy === 'file_size' ? order : false}>
                        <TableSortLabel active={orderBy === 'file_size'} direction={order} onClick={() => handleSortRequest('file_size')}>
                            Größe
                        </TableSortLabel>
                        </TableCell>
                        <TableCell align="right" sortDirection={orderBy === 'created_at' ? order : false}>
                        <TableSortLabel active={orderBy === 'created_at'} direction={order} onClick={() => handleSortRequest('created_at')}>
                            Datum
                        </TableSortLabel>
                        </TableCell>
                        <TableCell align="center">Aktionen</TableCell>
                    </TableRow>
                    </TableHead>
                    <TableBody>
                    {sortedAndFilteredFiles.length > 0 ? sortedAndFilteredFiles.map((file) => (
                        <TableRow key={file.id} hover>
                        <TableCell component="th" scope="row">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {getFileIcon(file.file_type)}
                                {file.filename}
                            </Box>
                        </TableCell>
                        {isAdmin && (
                            <TableCell>
                            <Chip label={file.business_partner_name} size="small" />
                            </TableCell>
                        )}
                        <TableCell sx={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <Tooltip title={file.description || ''}>
                            <span>{file.description || '-'}</span>
                            </Tooltip>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 250 }}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {file.tags?.map((tag) => (
                                <Chip key={tag} label={tag} size="small" variant="outlined" />
                            ))}
                            </Box>
                        </TableCell>
                        <TableCell align="right">{formatFileSize(file.file_size, 2)}</TableCell>
                        <TableCell align="right">{new Date(file.created_at).toLocaleDateString('de-DE')}</TableCell>
                        <TableCell align="center">
                            {isUploader && (
                                <Tooltip title="Bearbeiten">
                                    <IconButton color="primary" onClick={() => handleOpenEditDialog(file)} size="small">
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                            {isUploader && (
                                <Tooltip title="Teilen">
                                    <IconButton color="primary" onClick={() => handleOpenShare(file)} size="small">
                                        <ShareIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                            <Tooltip title="Download">
                            <IconButton onClick={() => handleFileDownload(file.id)} size="small">
                                <DownloadIcon fontSize="small" />
                            </IconButton>
                            </Tooltip>
                            {isUploader && (
                            <Tooltip title="Löschen">
                                <IconButton onClick={() => handleFileDelete(file.id)} size="small">
                                <DeleteIcon color="error" fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            )}
                        </TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                        <TableCell colSpan={isAdmin ? 7 : 6} align="center">
                            <Typography color="text.secondary" sx={{ p: 3 }}>
                            {searchTerm ? 'Keine Dateien gefunden.' : 'Keine Dateien vorhanden.'}
                            </Typography>
                        </TableCell>
                        </TableRow>
                    )}
                    </TableBody>
                </Table>
                </TableContainer>
            )}

            {/* MOBILE CARD VIEW */}
            {isMobile && (
                <Stack spacing={2}>
                    {sortedAndFilteredFiles.length > 0 ? sortedAndFilteredFiles.map((file) => (
                        <Card key={file.id}>
                            <CardContent sx={{ pb: 1 }}>
                                <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                                    {getFileIcon(file.file_type)}
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle1" fontWeight="bold" noWrap>{file.filename}</Typography>
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString('de-DE')}
                                        </Typography>
                                    </Box>
                                </Box>
                                {file.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{file.description}</Typography>}
                                {file.tags && file.tags.length > 0 && (
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {file.tags.map(tag => <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />)}
                                    </Box>
                                )}
                            </CardContent>
                            <Divider />
                            <CardActions sx={{ justifyContent: 'flex-end' }}>
                                {isUploader && (
                                    <IconButton onClick={() => handleOpenEditDialog(file)} size="small" color="primary">
                                        <EditIcon />
                                    </IconButton>
                                )}
                                {isUploader && (
                                    <IconButton onClick={() => handleOpenShare(file)} size="small" color="primary">
                                        <ShareIcon />
                                    </IconButton>
                                )}
                                <IconButton onClick={() => handleFileDownload(file.id)} size="small">
                                    <DownloadIcon />
                                </IconButton>
                                {isUploader && (
                                    <IconButton onClick={() => handleFileDelete(file.id)} size="small" color="error">
                                        <DeleteIcon />
                                    </IconButton>
                                )}
                            </CardActions>
                        </Card>
                    )) : (
                        <Typography color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
                            {searchTerm ? 'Keine Dateien gefunden.' : 'Keine Dateien vorhanden.'}
                        </Typography>
                    )}
                </Stack>
            )}
        </>
      )}
    </Box>
  );
};

export default FileManagementPage;