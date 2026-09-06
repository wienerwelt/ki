import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import DashboardLayout from '../components/DashboardLayout';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

type LeadStatus = 'new' | 'in_review' | 'planned' | 'done' | 'rejected';

interface SalesLead {
  id: string;
  description: string;
  name: string;
  organization: string | null;
  email: string;
  audience: string | null;
  status: LeadStatus;
  created_at: string;
}

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string; color: 'error' | 'warning' | 'info' | 'success' | 'default' }> = [
  { value: 'new', label: 'Neu', color: 'error' },
  { value: 'in_review', label: 'Qualifizierung', color: 'warning' },
  { value: 'planned', label: 'Termin / Angebot', color: 'info' },
  { value: 'done', label: 'Abgeschlossen', color: 'success' },
  { value: 'rejected', label: 'Nicht weiterverfolgen', color: 'default' },
];

const statusMeta = (status: LeadStatus) => STATUS_OPTIONS.find((option) => option.value === status) || STATUS_OPTIONS[0];

const AdminSalesLeadsPage: React.FC = () => {
  const { showSnackbar } = useSnackbar();
  const [items, setItems] = useState<SalesLead[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<'all' | LeadStatus>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/admin/sales-leads', {
        params: { status, search, page: page + 1, limit: rowsPerPage },
      });
      if (!response.res.ok) throw new Error(response.data?.message || 'Sales-Anfragen konnten nicht geladen werden.');
      setItems(response.data?.items || []);
      setSummary(response.data?.summary || {});
      setTotal(Number(response.data?.pagination?.total || 0));
    } catch (loadError: any) {
      setError(loadError.message || 'Sales-Anfragen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, status]);

  useEffect(() => {
    const timeout = window.setTimeout(loadLeads, 250);
    return () => window.clearTimeout(timeout);
  }, [loadLeads]);

  const updateStatus = async (id: string, nextStatus: LeadStatus) => {
    try {
      const response = await apiClient.request(`/api/admin/sales-leads/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.res.ok) throw new Error(response.data?.message || 'Status konnte nicht aktualisiert werden.');
      setItems((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
      window.dispatchEvent(new Event('menu-badges-refresh'));
      showSnackbar('Bearbeitungsstatus aktualisiert', 'success');
      await loadLeads();
    } catch (updateError: any) {
      showSnackbar(updateError.message || 'Status konnte nicht aktualisiert werden.', 'error');
    }
  };

  return (
    <DashboardLayout>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.5 }}>
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 900 }}>Account-Radar Anfragen</Typography>
            <Typography color="text.secondary">Vom Pilotinteresse bis zur manuellen Paketfreigabe – ohne automatische Kontoerstellung.</Typography>
          </Box>
          <Button href="/account-radar#pakete" target="_blank" rel="noopener noreferrer" variant="outlined" endIcon={<OpenInNewIcon />}>
            Produktseite öffnen
          </Button>
        </Stack>

        <Alert severity="info" sx={{ mb: 2.5 }}>
          Empfohlener Ablauf: Anfrage qualifizieren → Termin oder Angebot planen → Mandant unter „Business Partner“ anlegen bzw. Sales-Status aktivieren.
        </Alert>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper variant="outlined" sx={{ p: 2, mb: 2.5 }}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
            <Chip clickable color={status === 'all' ? 'primary' : 'default'} label={`Alle ${summary.all || 0}`} onClick={() => { setStatus('all'); setPage(0); }} />
            {STATUS_OPTIONS.map((option) => (
              <Chip key={option.value} clickable variant={status === option.value ? 'filled' : 'outlined'} color={status === option.value ? option.color : 'default'} label={`${option.label} ${summary[option.value] || 0}`} onClick={() => { setStatus(option.value); setPage(0); }} />
            ))}
          </Stack>
          <TextField
            fullWidth
            size="small"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(0); }}
            placeholder="Name, Organisation, E-Mail oder Nachricht suchen"
            InputProps={{ startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} /> }}
          />
        </Paper>

        <TableContainer component={Paper} variant="outlined">
          <Table sx={{ minWidth: 940 }}>
            <TableHead>
              <TableRow>
                <TableCell>Eingang</TableCell>
                <TableCell>Interessent</TableCell>
                <TableCell>Paket / Anlass</TableCell>
                <TableCell>Nachricht</TableCell>
                <TableCell sx={{ width: 190 }}>Bearbeitung</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!items.length && !loading && (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>Keine passenden Anfragen.</TableCell></TableRow>
              )}
              {items.map((lead) => {
                const meta = statusMeta(lead.status);
                return (
                  <TableRow key={lead.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(lead.created_at).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 800 }}>{lead.name}</Typography>
                      <Typography variant="body2" color="text.secondary">{lead.organization || 'Organisation nicht angegeben'}</Typography>
                      <Button component="a" href={`mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent('Account-Radar Anfrage')}`} size="small" startIcon={<EmailOutlinedIcon />} sx={{ mt: 0.5, px: 0 }}>{lead.email}</Button>
                    </TableCell>
                    <TableCell><Chip size="small" label={(lead.audience || 'Account-Radar').replace(/^Account-Radar\s*·\s*/, '')} /></TableCell>
                    <TableCell><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', maxWidth: 440 }}>{lead.description}</Typography></TableCell>
                    <TableCell>
                      <FormControl size="small" fullWidth>
                        <InputLabel>Status</InputLabel>
                        <Select label="Status" value={lead.status} onChange={(event) => updateStatus(lead.id, event.target.value as LeadStatus)}>
                          {STATUS_OPTIONS.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                        </Select>
                      </FormControl>
                      <Chip size="small" color={meta.color} label={meta.label} sx={{ mt: 1 }} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage="Pro Seite"
          />
        </TableContainer>
      </Container>
    </DashboardLayout>
  );
};

export default AdminSalesLeadsPage;
