import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TableSortLabel, TextField, Typography,
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
type SortKey = 'contact' | 'scenario' | 'status' | 'expires_at' | 'last_login_at';
type ConfirmAction = { id: string; kind: 'revoke' | 'delete' };
type ErrorAction = { path: string; label: string };

const invitationStatus = (item: Invitation) => {
  const expired = new Date(item.expires_at).getTime() <= Date.now();
  return item.revoked_at ? 'Widerrufen' : expired ? 'Abgelaufen' : item.accepted_at ? 'Aktiv' : item.delivery_status === 'failed' ? 'Versand fehlgeschlagen' : 'Eingeladen';
};

const AdminDemoAccessPage: React.FC = () => {
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errorAction, setErrorAction] = useState<ErrorAction | null>(null);
  const [success, setSuccess] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('contact');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [form, setForm] = useState({ first_name: '', last_name: '', organization_name: '', email: '', scenario: 'both' as Scenario, days: 14 });
  const [focusId] = useState(() => new URLSearchParams(window.location.search).get('focus'));

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
  useEffect(() => {
    if (!focusId || !items.some((item) => item.id === focusId)) return;
    const timer = window.setTimeout(() => document.getElementById(`demo-invitation-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    return () => window.clearTimeout(timer);
  }, [focusId, items]);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(''); setErrorAction(null); setSuccess('');
    try {
      const response = await apiClient.post('/api/admin/demo-invitations', form);
      if (!response.res.ok) {
        setError(response.data?.message || 'Einladung fehlgeschlagen.');
        const management = response.data?.management;
        setErrorAction(management?.path && management?.label ? management : null);
        await load();
        return;
      }
      setSuccess('Die persönliche Einladung wurde versendet.');
      setForm({ first_name: '', last_name: '', organization_name: '', email: '', scenario: 'both', days: 14 });
      await load();
    } catch (cause: any) {
      setError(cause.message || 'Einladung fehlgeschlagen.');
      setErrorAction(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const action = async (id: string, kind: 'resend' | 'revoke' | 'delete') => {
    setError(''); setErrorAction(null); setSuccess(''); setSaving(true);
    try {
      const response = kind === 'delete'
        ? await apiClient.delete(`/api/admin/demo-invitations/${id}`)
        : await apiClient.post(`/api/admin/demo-invitations/${id}/${kind}`, {});
      if (!response.res.ok) throw new Error(response.data?.message || 'Aktion fehlgeschlagen.');
      setSuccess(kind === 'delete' ? 'Demo-Zugang vollständig gelöscht.' : kind === 'revoke' ? 'Demo-Zugang widerrufen.' : 'Einladung erneut versendet.');
      await load();
    } catch (cause: any) {
      setError(cause.message || 'Aktion fehlgeschlagen.');
    } finally {
      setSaving(false); setConfirmAction(null);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDirection('asc'); }
  };

  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    const value = (item: Invitation) => {
      if (sortKey === 'contact') return `${item.last_name} ${item.first_name} ${item.organization_name} ${item.email}`.trim().toLocaleLowerCase('de');
      if (sortKey === 'scenario') return scenarioLabel[item.scenario];
      if (sortKey === 'status') return invitationStatus(item);
      if (sortKey === 'expires_at') return new Date(item.expires_at).getTime();
      return item.last_login_at ? new Date(item.last_login_at).getTime() : 0;
    };
    const left = value(a); const right = value(b);
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'de', { sensitivity: 'base' });
    return sortDirection === 'asc' ? comparison : -comparison;
  }), [items, sortDirection, sortKey]);

  const sortHeader = (label: string, key: SortKey) => (
    <TableCell sortDirection={sortKey === key ? sortDirection : false}>
      <TableSortLabel active={sortKey === key} direction={sortKey === key ? sortDirection : 'asc'} onClick={() => handleSort(key)}>
        {label}
      </TableSortLabel>
    </TableCell>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={900}>Demo-Zugänge</Typography>
          <Typography color="text.secondary">Persönliche, befristete und schreibgeschützte Zugänge für ausgewählte Interessenten. Jede Einladung erhält einen eigenen Demo-Mandanten; nur Admins können einladen oder widerrufen.</Typography>
        </Box>
        {error && <Alert severity="error" onClose={() => { setError(''); setErrorAction(null); }} action={errorAction ? <Button color="inherit" size="small" component="a" href={errorAction.path} sx={{ whiteSpace: 'nowrap' }}>{errorAction.label}</Button> : undefined}>{error}</Alert>}
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
          <Alert severity="info" sx={{ mt: 2.5, alignItems: 'flex-start' }}>
            <Typography fontWeight={800} gutterBottom>Diese Informationen erhält der Interessent automatisch</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
              <li>persönlicher, einmal verwendbarer Aktivierungslink und Passwortvorgabe mit mindestens 12 Zeichen</li>
              <li>{scenarioLabel[form.scenario]}-Demo für {form.days} Tage; die Laufzeit beginnt bereits mit dem Versand</li>
              <li>Sales mit fiktiven Beispieldaten, Content mit öffentlichen Brancheninformationen – ohne Daten anderer Mandanten</li>
              <li>schreibgeschützte Umgebung: Änderungen, KI-Anfragen, Exporte und Versand sind deaktiviert</li>
              <li>kurzer empfohlener Rundgang durch die wichtigsten Bereiche des gewählten Szenarios</li>
            </Box>
          </Alert>
        </Paper>
        <Paper sx={{ p: { xs: 1, md: 2 }, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={800} sx={{ px: 1, py: 1 }}>Einladungen {items.length > 0 && `(${items.length})`}</Typography>
          {loading && <Typography sx={{ p: 2 }}>Lade …</Typography>}
          <TableContainer>
            <Table size="small" aria-label="Demo-Einladungen">
              <TableHead><TableRow>{sortHeader('Interessent', 'contact')}{sortHeader('Szenario', 'scenario')}{sortHeader('Status', 'status')}{sortHeader('Ablauf', 'expires_at')}{sortHeader('Letzter Login', 'last_login_at')}<TableCell>Aktionen</TableCell></TableRow></TableHead>
              <TableBody>{sortedItems.map((item) => {
                const expired = new Date(item.expires_at).getTime() <= Date.now();
                const status = invitationStatus(item);
                return <TableRow key={item.id} id={`demo-invitation-${item.id}`} selected={item.id === focusId} sx={item.id === focusId ? { '&.Mui-selected': { bgcolor: 'warning.light' } } : undefined}>
                  <TableCell><Typography fontWeight={700}>{item.first_name} {item.last_name}</Typography><Typography variant="body2">{item.email}</Typography><Typography variant="caption" color="text.secondary">{item.organization_name}</Typography></TableCell>
                  <TableCell>{scenarioLabel[item.scenario]}</TableCell>
                  <TableCell><Chip label={status} size="small" color={status === 'Aktiv' ? 'success' : status === 'Versand fehlgeschlagen' ? 'error' : status === 'Eingeladen' ? 'info' : 'default'} /></TableCell>
                  <TableCell>{dateLabel(item.expires_at)}</TableCell><TableCell>{dateLabel(item.last_login_at)}</TableCell>
                  <TableCell><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    {!item.accepted_at && !item.revoked_at && !expired && <Button size="small" onClick={() => void action(item.id, 'resend')} disabled={saving} sx={{ whiteSpace: 'nowrap' }}>Erneut senden</Button>}
                    {!item.revoked_at && !expired && <Button size="small" color="warning" onClick={() => setConfirmAction({ id: item.id, kind: 'revoke' })} disabled={saving}>Widerrufen</Button>}
                    <Button size="small" color="error" onClick={() => setConfirmAction({ id: item.id, kind: 'delete' })} disabled={saving}>Löschen</Button>
                  </Stack></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </TableContainer>
          {!loading && items.length === 0 && <Typography sx={{ p: 2 }} color="text.secondary">Noch keine Demo-Einladungen.</Typography>}
        </Paper>
      </Stack>
      <Dialog open={Boolean(confirmAction)} onClose={() => setConfirmAction(null)}>
        <DialogTitle>{confirmAction?.kind === 'delete' ? 'Demo-Zugang endgültig löschen?' : 'Demo-Zugang widerrufen?'}</DialogTitle>
        <DialogContent>{confirmAction?.kind === 'delete'
          ? 'Der Demo-Benutzer, alle zugehörigen Einladungen und der isolierte Demo-Mandant werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.'
          : 'Der Zugang wird sofort gesperrt. Offene Einladungslinks werden ungültig; der Eintrag bleibt in der Übersicht.'}</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmAction(null)}>Abbrechen</Button>
          <Button color="error" onClick={() => confirmAction && void action(confirmAction.id, confirmAction.kind)}>
            {confirmAction?.kind === 'delete' ? 'Endgültig löschen' : 'Widerrufen'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AdminDemoAccessPage;
