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
import SearchIcon from '@mui/icons-material/Search';
import StorageIcon from '@mui/icons-material/Storage';
import ShareIcon from '@mui/icons-material/Share';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

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
  const [isPartnerListLoading, setIsPartnerListLoading] = useState(false);
  
  const [shareOpen, setShareOpen] = useState(false);
  const [fileToShare, setFileToShare] = useState<PartnerFile | null>(null);
  const [shareText, setShareText] = useState('');
  const [shareCategory, setShareCategory] = useState('');
  const [sharing, setSharing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]); 

  const isAdmin = user?.role === 'admin';
  const isAssistent = user?.role === 'assistenz';
  const isUploader = isAdmin || isAssistent;

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/files');
      setFiles(response.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Fehler beim Laden der Dateien.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleFileDownload = async (fileId: string, filename: string) => {
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

        await apiClient.post('/api/community/feed', {
            content: shareText,
            categoryId: shareCategory,
            existingFileUrl: publicUrl
        });

        showSnackbar('Datei erfolgreich in der Community geteilt!', 'success');
        setShareOpen(false);
    } catch (err) {
        console.error(err);
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
  
  const usageBytes = businessPartner?.storage_usage_bytes ?? 0;
  const limitBytes = businessPartner?.storage_limit_bytes ?? 0;
  const usagePercent = limitBytes > 0 ? (Math.max(0, usageBytes) / limitBytes) * 100 : 0;
  
  const canUpload = useMemo(() => {
    if (isAssistent) {
      const limit = parseInt(String(businessPartner?.storage_limit_bytes ?? 0), 10);
      const usage = parseInt(String(businessPartner?.storage_usage_bytes ?? 0), 10);
      return limit > 0 && usage < limit;
    }
    if (isAdmin) {
      return true;
    }
    return false;
  }, [isAdmin, isAssistent, businessPartner]);


  return (
    <Box sx={{ p: isMobile ? 1 : 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant={isMobile ? "h5" : "h4"}>Datencloud</Typography>
        {/* Mobile: Upload Button in Header */}
        {isMobile && isUploader && (
            <Tooltip title={!canUpload ? 'Speicherlimit erreicht.' : 'Hochladen'}>
                <IconButton 
                    color="primary" 
                    onClick={handleOpenUploadDialog} 
                    disabled={!canUpload}
                    sx={{ bgcolor: 'action.hover' }}
                >
                    <UploadFileIcon />
                </IconButton>
            </Tooltip>
        )}
      </Box>

      {isUploader && businessPartner && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <StorageIcon color="action" />
            <Typography variant="body1" sx={{ flexGrow: 1 }}>
              Speicher {isMobile ? '' : `(Paket: ${businessPartner?.storage_tier || 'N/A'})`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {`${formatFileSize(usageBytes)} / ${formatFileSize(limitBytes)}`}
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={usagePercent} sx={{ height: 8, borderRadius: 4 }} />
        </Paper>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
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
          {!isMobile && isUploader && (
            <Tooltip title={!canUpload ? 'Speicherlimit erreicht oder Paket erlaubt keine Uploads.' : ''}>
              <span>
                <Button
                  variant="contained"
                  startIcon={<UploadFileIcon />}
                  disabled={!canUpload}
                  onClick={handleOpenUploadDialog}
                >
                  Datei hochladen
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
      </Paper>

      {error && (
        <Box sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {/* UPLOAD DIALOG */}
      <Dialog open={openUploadDialog} onClose={handleCloseUploadDialog} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle>Datei hochladen</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {isAdmin && (
              <FormControl fullWidth required>
                <InputLabel id="partner-select-label">Business Partner</InputLabel>
                <Select
                  labelId="partner-select-label"
                  value={selectedPartnerId}
                  label="Business Partner"
                  onChange={(e) => setSelectedPartnerId(e.target.value as string)}
                  disabled={isPartnerListLoading}
                >
                  {isPartnerListLoading && <MenuItem disabled>Lade Partner...</MenuItem>}
                  {partners.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <Button variant="outlined" component="label" fullWidth sx={{ height: 100, borderStyle: 'dashed' }}>
              {fileToUpload ? fileToUpload.name : <Box sx={{textAlign:'center'}}><UploadFileIcon sx={{fontSize: 40, color: 'text.secondary'}} /><br/>Datei auswählen</Box>}
              <input type="file" hidden onChange={handleFileSelect} />
            </Button>

            <TextField
              label="Beschreibung"
              fullWidth
              variant="outlined"
              value={fileDescription}
              onChange={(e) => setFileDescription(e.target.value)}
            />

            <TextField
              label="Tags (Komma getrennt)"
              fullWidth
              variant="outlined"
              value={fileTags}
              onChange={(e) => setFileTags(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseUploadDialog}>Abbrechen</Button>
          <Button onClick={handleFileUpload} variant="contained" disabled={!fileToUpload || uploading}>
            {uploading ? <CircularProgress size={24} /> : 'Hochladen'}
          </Button>
        </DialogActions>
      </Dialog>
      
      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
            <DialogTitle>Datei teilen</DialogTitle>
            <DialogContent dividers>
                <DialogContentText sx={{ mb: 2 }}>
                    Poste <strong>{fileToShare?.filename}</strong> in der Community.
                </DialogContentText>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label="Nachricht"
                        fullWidth
                        multiline
                        rows={3}
                        value={shareText}
                        onChange={(e) => setShareText(e.target.value)}
                    />
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
                                <InsertDriveFileIcon color="action" />
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
                                <Tooltip title="Teilen">
                                    <IconButton color="primary" onClick={() => handleOpenShare(file)} size="small">
                                        <ShareIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                            <Tooltip title="Download">
                            <IconButton onClick={() => handleFileDownload(file.id, file.filename)} size="small">
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
                                    <InsertDriveFileIcon color="action" fontSize="large" />
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
                                    <IconButton onClick={() => handleOpenShare(file)} size="small" color="primary">
                                        <ShareIcon />
                                    </IconButton>
                                )}
                                <IconButton onClick={() => handleFileDownload(file.id, file.filename)} size="small">
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