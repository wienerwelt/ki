// frontend/src/pages/FileManagementPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  IconButton, Tooltip, TextField, InputAdornment, LinearProgress, TableSortLabel, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle, Stack,
  Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
// KORREKTUR: `fetchBusinessPartnerData` wird nun korrekt aus dem AuthContext importiert.
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';

// Icons
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import StorageIcon from '@mui/icons-material/Storage';

// ... (Interfaces und Helper Functions bleiben unverändert) ...
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
  const { user, businessPartner, fetchBusinessPartnerData } = useAuth(); // <-- Fehler ist hier behoben
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
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Fehler beim Löschen der Datei.');
    }
  };

  const handleFileDownload = async (fileId: string, filename: string) => {
    try {
      const response = await apiClient.get(`/api/files/${fileId}/download`);
      const { url } = response.data || {};
      if (!url) throw new Error('Download-URL fehlt.');
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any)
      {
      setError(err?.response?.data?.message || err?.message || 'Fehler beim Herunterladen der Datei.');
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
    if (isAdmin) return true;
    if (isAssistent) {
      return businessPartner && businessPartner.storage_limit_bytes > 0 && businessPartner.storage_usage_bytes < businessPartner.storage_limit_bytes;
    }
    return false;
  }, [isAdmin, isAssistent, businessPartner]);


  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Dateiverzeichnis</Typography>

      {isUploader && businessPartner && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <StorageIcon color="action" />
            <Typography variant="body1" sx={{ flexGrow: 1 }}>
              Speicherplatz (Paket: <strong>{businessPartner?.storage_tier || 'N/A'}</strong>)
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
            variant="outlined"
            size="small"
            placeholder={isAdmin ? 'Dateien, Partner, Beschreibung suchen...' : 'Dateien durchsuchen...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon /></InputAdornment>) }}
            sx={{ minWidth: '300px' }}
          />
          {isUploader && (
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

      <Dialog open={openUploadDialog} onClose={handleCloseUploadDialog} fullWidth maxWidth="sm">
        <DialogTitle>Neue Datei hochladen</DialogTitle>
        <DialogContent>
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

            <Button variant="outlined" component="label">
              {fileToUpload ? fileToUpload.name : 'Datei auswählen'}
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
              label="Tags (durch Komma getrennt)"
              fullWidth
              variant="outlined"
              value={fileTags}
              onChange={(e) => setFileTags(e.target.value)}
              helperText="z.B. Rechnung, Quartal_1, wichtig"
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
                  <TableCell colSpan={isAdmin ? 7 : 6} align="center">
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