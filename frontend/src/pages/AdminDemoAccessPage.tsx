import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import apiClient from '../apiClient';

type Scenario = 'content' | 'sales' | 'both';
type Invitation = {
  id: string; email: string; first_name: string; last_name: string; organization_name: string;
  scenario: Scenario; created_at: string; expires_at: string; accepted_at: string | null;
  revoked_at: string | null; delivery_status: 'pending' | 'sent' | 'failed';
  is_active: boolean; last_login_at: string | null;
};
const scenarioLabel = { content: 'Content', sales: 'Sales', both: 'Content & Sales' };
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('de-AT') : '–';

const AdminDemoAccessPage: React.FC = () => {
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', organization_name: '', email: '', scenario: 'both' as Scenario, days: 14 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/admin/demo-invitations');
      if (!response.res.ok) throw new Error(response.data?.message || 'Einladungen konnten nicht geladen werden.');
      setItems(Array.isArray(response.data) ? response.data : []);
    } catch (cause: any) {
      setError(cause.message || 'Einladungen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const response = await apiClient.post('/api/admin/demo-invitations', form);
      if (!response.res.ok) throw new Error(response.data?.message || 'Einladung fehlgeschlagen.');
      setSuccess('Die persönliche Einladung wurde versendet.');
      setForm({ first_name: '', last_name: '', organization_name: '', email: '', scenario: 'both', days: 14 });
      await load();
    } catch (cause: any) {
      setError(cause.message || 'Einladung fehlgeschlagen.');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const action = async (id: string, kind: 'resend' | 'revoke') => {
    setError(''); setSuccess(''); setSaving(true);
    try {
      const response = await apiClient.post(`/api/admin/demo-invitations/${id}/${kind}`, {});
      if (!response.res.ok) throw new Error(response.data?.message || 'Aktion fehlgeschlagen.');
      setSuccess(kind === 'revoke' ? 'Demo-Zugang widerrufen.' : 'Einladung erneut versendet.');
      await load();
    } catch (cause: any) {
      setError(cause.message || 'Aktion fehlgeschlagen.');
    } finally {
      setSaving(false); setConfirmId(null);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={900}>Demo-Zugänge</Typography>
          <Typography color="text.secondary">Persönliche, befristete und schreibgeschützte Zugänge für ausgewählte Interessenten. Jede Einladung erhält einen eigenen Demo-Mandanten; nur Admins können einladen oder widerrufen.</Typography>
        </Box>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}
        <Paper component="form" onSubmit={invite} sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={800} gutterBottom>Interessenten einladen</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField label="Vorname" required value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} fullWidth />
            <TextField label="Nachname" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} fullWidth />
            <TextField label="Organisation" required value={form.organization_name} onChange={(event) => setForm({ ...form, organization_name: event.target.value })} fullWidth />
            <TextField label="E-Mail" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <FormControl sx={{ minWidth: 190 }}><InputLabel>Szenario</InputLabel><Select label="Szenario" value={form.scenario} onChange={(event) => setForm({ ...form, scenario: event.target.value as Scenario })}>
              <MenuItem value="content">Content</MenuItem><MenuItem value="sales">Sales</MenuItem><MenuItem value="both">Content & Sales</MenuItem>
            </Select></FormControl>
            <FormControl sx={{ minWidth: 150 }}><InputLabel>Laufzeit</InputLabel><Select label="Laufzeit" value={form.days} onChange={(event) => setForm({ ...form, days: Number(event.target.value) })}>
              <MenuItem value={7}>7 Tage</MenuItem><MenuItem value={14}>14 Tage</MenuItem>
            </Select></FormControl>
            <Button type="submit" variant="contained" disabled={saving} sx={{ minHeight: 48, whiteSpace: 'nowrap' }}>{saving ? 'Bitte warten …' : 'Einladung senden'}</Button>
          </Stack>
        </Paper>
        <Paper sx={{ p: { xs: 1, md: 2 }, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={800} sx={{ px: 1, py: 1 }}>Einladungen {items.length > 0 && `(${items.length})`}</Typography>
          {loading && <Typography sx={{ p: 2 }}>Lade …</Typography>}
          <TableContainer>
            <Table size="small" aria-label="Demo-Einladungen">
              <TableHead><TableRow><TableCell>Interessent</TableCell><TableCell>Szenario</TableCell><TableCell>Status</TableCell><TableCell>Ablauf</TableCell><TableCell>Letzter Login</TableCell><TableCell>Aktionen</TableCell></TableRow></TableHead>
              <TableBody>{items.map((item) => {
                const expired = new Date(item.expires_at).getTime() <= Date.now();
                const status = item.revoked_at ? 'Widerrufen' : expired ? 'Abgelaufen' : item.accepted_at ? 'Aktiv' : item.delivery_status === 'failed' ? 'Versand fehlgeschlagen' : 'Eingeladen';
                return <TableRow key={item.id}>
                  <TableCell><Typography fontWeight={700}>{item.first_name} {item.last_name}</Typography><Typography variant="body2">{item.email}</Typography><Typography variant="caption" color="text.secondary">{item.organization_name}</Typography></TableCell>
                  <TableCell>{scenarioLabel[item.scenario]}</TableCell>
                  <TableCell><Chip label={status} size="small" color={status === 'Aktiv' ? 'success' : status === 'Versand fehlgeschlagen' ? 'error' : status === 'Eingeladen' ? 'info' : 'default'} /></TableCell>
                  <TableCell>{dateLabel(item.expires_at)}</TableCell><TableCell>{dateLabel(item.last_login_at)}</TableCell>
                  <TableCell><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    {!item.accepted_at && !item.revoked_at && !expired && <Button size="small" onClick={() => void action(item.id, 'resend')} disabled={saving} sx={{ whiteSpace: 'nowrap' }}>Erneut senden</Button>}
                    {!item.revoked_at && !expired && <Button size="small" color="error" onClick={() => setConfirmId(item.id)} disabled={saving}>Widerrufen</Button>}
                  </Stack></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </TableContainer>
          {!loading && items.length === 0 && <Typography sx={{ p: 2 }} color="text.secondary">Noch keine Demo-Einladungen.</Typography>}
        </Paper>
      </Stack>
      <Dialog open={Boolean(confirmId)} onClose={() => setConfirmId(null)}>
        <DialogTitle>Demo-Zugang widerrufen?</DialogTitle>
        <DialogContent>Der Zugang wird sofort gesperrt. Offene Einladungslinks werden ungültig.</DialogContent>
        <DialogActions><Button onClick={() => setConfirmId(null)}>Abbrechen</Button><Button color="error" onClick={() => confirmId && void action(confirmId, 'revoke')}>Widerrufen</Button></DialogActions>
      </Dialog>
    </Container>
  );
};

export default AdminDemoAccessPage;
