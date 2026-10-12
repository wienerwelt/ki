import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Container, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Grid, IconButton, MenuItem, Paper, Stack, TextField,
  Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

type ModuleKey = 'content' | 'sales' | 'community' | 'public_page' | 'admin';
type UpdateStatus = 'draft' | 'published';
type PlatformUpdate = {
  id: string; slug: string; title: string; summary: string; body: string; benefits: string | null;
  modules: ModuleKey[]; image_url: string | null; action_required: boolean; action_text: string | null;
  status: UpdateStatus; published_at: string | null; created_at: string; updated_at: string;
  audience_scope: 'all' | 'selected'; audience_partner_ids: string[]; audience_partner_names: string[];
};
type PartnerOption = { id: string; name: string; slug: string | null; is_active?: boolean };
type PlatformUpdateForm = {
  title: string; summary: string; body: string; benefits: string; modules: ModuleKey[];
  image_url: string; action_required: boolean; action_text: string; status: UpdateStatus;
  audience_scope: 'all' | 'selected'; audience_partner_ids: string[];
};

const MODULES: Array<{ key: ModuleKey; label: string; description: string }> = [
  { key: 'content', label: 'Content', description: 'News, Inhalte, Widgets und redaktionelle Funktionen' },
  { key: 'sales', label: 'Sales / Account-Radar', description: 'Accounts, Trigger, Pipeline und Kontaktplanung' },
  { key: 'community', label: 'Community', description: 'Community, Menschen & Karriere und Mitgliederfunktionen' },
  { key: 'public_page', label: 'Publicpage', description: 'Öffentliches Mitgliederportal und dessen Darstellung' },
  { key: 'admin', label: 'Administration', description: 'Verwaltung, Einstellungen, Reports und interne Werkzeuge' },
];
const EMPTY_FORM: PlatformUpdateForm = {
  title: '', summary: '', body: '', benefits: '', modules: ['public_page'] as ModuleKey[],
  image_url: '', action_required: false, action_text: '', status: 'draft' as UpdateStatus,
  audience_scope: 'all', audience_partner_ids: [],
};
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('de-AT') : 'Noch nicht veröffentlicht';
const normalizePlatformUpdate = (value: any): PlatformUpdate => ({
  ...value,
  modules: Array.isArray(value?.modules) ? value.modules : [],
  audience_scope: value?.audience_scope === 'selected' ? 'selected' : 'all',
  audience_partner_ids: Array.isArray(value?.audience_partner_ids) ? value.audience_partner_ids : [],
  audience_partner_names: Array.isArray(value?.audience_partner_names) ? value.audience_partner_names : [],
});

const AdminPlatformUpdatesPage: React.FC = () => {
  const { showSnackbar } = useSnackbar();
  const [items, setItems] = useState<PlatformUpdate[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [selectedPartnerSlug, setSelectedPartnerSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformUpdate | null>(null);
  const [form, setForm] = useState<PlatformUpdateForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [response, partnerResponse] = await Promise.all([
        apiClient.get('/api/admin/platform-updates'),
        apiClient.get('/api/admin/business-partners'),
      ]);
      if (!response.res.ok) throw new Error(response.data?.message || 'Plattform-Updates konnten nicht geladen werden.');
      if (!partnerResponse.res.ok) throw new Error(partnerResponse.data?.message || 'Mandanten konnten nicht geladen werden.');
      setItems((Array.isArray(response.data) ? response.data : []).map(normalizePlatformUpdate));
      setPartners((Array.isArray(partnerResponse.data) ? partnerResponse.data : [])
        .filter((partner: PartnerOption) => partner.is_active !== false && partner.slug)
        .sort((a: PartnerOption, b: PartnerOption) => a.name.localeCompare(b.name, 'de')));
    } catch (cause: any) {
      setError(cause.message || 'Plattform-Updates konnten nicht geladen werden.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, modules: ['public_page'], audience_partner_ids: [] }); setDialogOpen(true); };
  const openEdit = (item: PlatformUpdate) => {
    setEditing(item);
    setForm({
      title: item.title, summary: item.summary, body: item.body, benefits: item.benefits || '',
      modules: item.modules, image_url: item.image_url || '', action_required: item.action_required,
      action_text: item.action_text || '', status: item.status,
      audience_scope: item.audience_scope || 'all', audience_partner_ids: item.audience_partner_ids || [],
    });
    setDialogOpen(true);
  };
  const toggleModule = (key: ModuleKey) => setForm((current) => ({
    ...current,
    modules: current.modules.includes(key)
      ? current.modules.filter((module) => module !== key)
      : [...current.modules, key],
  }));

  const save = async () => {
    setSaving(true); setError('');
    try {
      const response = editing
        ? await apiClient.put(`/api/admin/platform-updates/${editing.id}`, form)
        : await apiClient.post('/api/admin/platform-updates', form);
      if (!response.res.ok) throw new Error(response.data?.message || 'Plattform-Update konnte nicht gespeichert werden.');
      setDialogOpen(false);
      showSnackbar(editing ? 'Plattform-Update gespeichert.' : 'Plattform-Update angelegt.', 'success');
      await load();
    } catch (cause: any) { setError(cause.message || 'Speichern fehlgeschlagen.'); }
    finally { setSaving(false); }
  };

  const remove = async (item: PlatformUpdate) => {
    if (!window.confirm(`„${item.title}“ endgültig löschen?`)) return;
    setDeletingId(item.id);
    try {
      const response = await apiClient.delete(`/api/admin/platform-updates/${item.id}`);
      if (!response.res.ok) throw new Error(response.data?.message || 'Löschen fehlgeschlagen.');
      showSnackbar('Plattform-Update gelöscht.', 'success');
      await load();
    } catch (cause: any) {
      showSnackbar(cause.message || 'Löschen fehlgeschlagen.', 'error');
    } finally {
      setDeletingId('');
    }
  };

  const publicUrl = (item: PlatformUpdate) => `${window.location.origin}/${encodeURIComponent(selectedPartnerSlug)}/plattform-updates?update=${encodeURIComponent(item.slug)}`;
  const newsletterText = (item: PlatformUpdate) => [
    item.title, '', item.summary,
    item.benefits ? `Ihr Nutzen: ${item.benefits}` : '',
    item.action_required && item.action_text ? `Bitte beachten: ${item.action_text}` : '',
    '', `Alle Details: ${publicUrl(item)}`,
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join('\n').trim();
  const copyNewsletter = async (item: PlatformUpdate) => {
    await navigator.clipboard.writeText(newsletterText(item));
    showSnackbar('Newsletter-Baustein kopiert.', 'success');
  };

  const publishedCount = useMemo(() => items.filter((item) => item.status === 'published').length, [items]);
  const selectedPartnerId = partners.find((partner) => partner.slug === selectedPartnerSlug)?.id || '';
  const isVisibleForPreviewPartner = (item: PlatformUpdate) => Boolean(selectedPartnerId)
    && (item.audience_scope === 'all' || item.audience_partner_ids.includes(selectedPartnerId));

  return <Container maxWidth="xl" sx={{ py: 3 }}>
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={2}>
        <Box><Typography variant="h4" fontWeight={900}>Plattform-Updates</Typography><Typography color="text.secondary">Einmal pflegen und für alle oder gezielt ausgewählte Mandanten veröffentlichen.</Typography></Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ whiteSpace: 'nowrap' }}>Update anlegen</Button>
      </Stack>
      <Alert severity="info">Beim Anlegen oder Bearbeiten bestimmen Sie die Zielgruppe. Nur ausgewählte Mandanten sehen den Beitrag und dessen Badge auf ihrer Publicpage.</Alert>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <TextField
          select
          fullWidth
          label="Mandant für Vorschau und Newsletter-Link"
          value={selectedPartnerSlug}
          onChange={(event) => setSelectedPartnerSlug(event.target.value)}
          helperText="Diese Auswahl ändert nicht die Zielgruppe. Sie bestimmt nur Logo, Farben und URL für Vorschau und Newsletter-Link."
        >
          <MenuItem value=""><em>Bitte Mandant auswählen</em></MenuItem>
          {partners.map((partner) => <MenuItem key={partner.id} value={partner.slug || ''}>{partner.name}</MenuItem>)}
        </TextField>
      </Paper>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      <Typography variant="subtitle2" color="text.secondary">{items.length} Einträge · {publishedCount} veröffentlicht</Typography>
      {loading ? <Typography>Lade …</Typography> : <Grid container spacing={2}>{items.map((item) => <Grid item xs={12} md={6} lg={4} key={item.id}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
            <Box><Chip size="small" color={item.status === 'published' ? 'success' : 'default'} label={item.status === 'published' ? 'Veröffentlicht' : 'Entwurf'} /><Typography variant="h6" fontWeight={850} sx={{ mt: 1 }}>{item.title}</Typography></Box>
            <Stack direction="row"><Tooltip title="Bearbeiten"><span><IconButton disabled={deletingId === item.id} onClick={() => openEdit(item)}><EditOutlinedIcon /></IconButton></span></Tooltip><Tooltip title="Löschen"><span><IconButton disabled={deletingId === item.id} color="error" onClick={() => void remove(item)}><DeleteOutlineIcon /></IconButton></span></Tooltip></Stack>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{item.summary}</Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 2 }}>{item.modules.map((key) => <Chip key={key} size="small" variant="outlined" label={MODULES.find((module) => module.key === key)?.label || key} />)}</Stack>
          <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1.25 }}><Chip size="small" color="primary" variant="outlined" label={item.audience_scope === 'all' ? 'Alle Mandanten' : `${item.audience_partner_ids?.length || 0} ausgewählte Mandanten`} />{item.audience_scope === 'selected' && (item.audience_partner_names || []).slice(0, 2).map((name) => <Chip key={name} size="small" label={name} />)}{item.audience_scope === 'selected' && (item.audience_partner_names?.length || 0) > 2 && <Chip size="small" label={`+${item.audience_partner_names.length - 2}`} />}</Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>{dateLabel(item.published_at)}</Typography>
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 'auto', pt: 2 }}>
            <Tooltip title={!selectedPartnerSlug ? 'Zuerst einen Mandanten auswählen' : isVisibleForPreviewPartner(item) ? 'Newsletter-Baustein mit mandantenspezifischem Link kopieren' : 'Dieser Beitrag ist für den gewählten Mandanten nicht freigegeben'}><span><Button disabled={!isVisibleForPreviewPartner(item)} size="small" startIcon={<ContentCopyIcon />} onClick={() => void copyNewsletter(item)}>Newsletter-Text</Button></span></Tooltip>
            {item.status === 'published' && <Tooltip title={!selectedPartnerSlug ? 'Zuerst einen Mandanten auswählen' : isVisibleForPreviewPartner(item) ? 'Öffentliche Mandantenansicht öffnen' : 'Dieser Beitrag ist für den gewählten Mandanten nicht freigegeben'}><span><Button disabled={!isVisibleForPreviewPartner(item)} size="small" startIcon={<OpenInNewIcon />} onClick={() => window.open(publicUrl(item), '_blank', 'noopener,noreferrer')}>Öffnen</Button></span></Tooltip>}
          </Stack>
        </Paper>
      </Grid>)}</Grid>}
    </Stack>

    <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>{editing ? 'Plattform-Update bearbeiten' : 'Plattform-Update anlegen'}</DialogTitle>
      <DialogContent dividers><Stack spacing={2.2} sx={{ pt: 0.5 }}>
        <TextField label="Überschrift" required value={form.title} inputProps={{ maxLength: 180 }} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <TextField label="Kurztext für Übersicht und Newsletter" required multiline minRows={2} value={form.summary} inputProps={{ maxLength: 600 }} helperText={`${form.summary.length}/600 Zeichen`} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
        <TextField label="Was ist neu?" required multiline minRows={5} value={form.body} inputProps={{ maxLength: 12000 }} onChange={(event) => setForm({ ...form, body: event.target.value })} />
        <TextField label="Nutzen für Mitglieder" multiline minRows={2} value={form.benefits} inputProps={{ maxLength: 2000 }} onChange={(event) => setForm({ ...form, benefits: event.target.value })} />
        <Box>
          <Typography variant="subtitle2" gutterBottom>Betroffene Produktbereiche *</Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>Mehrfachauswahl möglich. Diese Auswahl kennzeichnet und filtert den Beitrag; sie bestimmt nicht, wo er veröffentlicht wird.</Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>{MODULES.map((module) => <Tooltip key={module.key} title={module.description} arrow><Chip label={module.label} clickable color={form.modules.includes(module.key) ? 'primary' : 'default'} variant={form.modules.includes(module.key) ? 'filled' : 'outlined'} onClick={() => toggleModule(module.key)} /></Tooltip>)}</Stack>
        </Box>
        <TextField select label="Veröffentlichen für" value={form.audience_scope} onChange={(event) => setForm({ ...form, audience_scope: event.target.value as 'all' | 'selected', audience_partner_ids: event.target.value === 'all' ? [] : form.audience_partner_ids })}><MenuItem value="all">Alle aktiven Mandanten</MenuItem><MenuItem value="selected">Ausgewählte Mandanten</MenuItem></TextField>
        {form.audience_scope === 'selected' && <TextField select required label="Mandanten auswählen" value={form.audience_partner_ids} onChange={(event) => setForm({ ...form, audience_partner_ids: typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value as string[] })} SelectProps={{ multiple: true, renderValue: (selected) => (selected as string[]).map((id) => partners.find((partner) => partner.id === id)?.name || id).join(', ') }} helperText={`${form.audience_partner_ids.length} Mandant${form.audience_partner_ids.length === 1 ? '' : 'en'} ausgewählt`}>{partners.map((partner) => <MenuItem key={partner.id} value={partner.id}><Checkbox checked={form.audience_partner_ids.includes(partner.id)} />{partner.name}</MenuItem>)}</TextField>}
        <TextField label="Bild-URL (optional)" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} helperText="Interner Pfad oder HTTPS-Adresse." />
        <FormControlLabel control={<Checkbox checked={form.action_required} onChange={(event) => setForm({ ...form, action_required: event.target.checked })} />} label="Nutzer müssen etwas beachten oder erledigen" />
        {form.action_required && <TextField label="Erforderliche Aktion" multiline minRows={2} value={form.action_text} onChange={(event) => setForm({ ...form, action_text: event.target.value })} />}
        <TextField select label="Status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as UpdateStatus })}><MenuItem value="draft">Entwurf</MenuItem><MenuItem value="published">Veröffentlicht</MenuItem></TextField>
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setDialogOpen(false)} disabled={saving}>Abbrechen</Button><Button variant="contained" onClick={() => void save()} disabled={saving || !form.title.trim() || !form.summary.trim() || !form.body.trim() || form.modules.length === 0 || (form.action_required && !form.action_text.trim()) || (form.audience_scope === 'selected' && form.audience_partner_ids.length === 0)}>{saving ? 'Speichere …' : 'Speichern'}</Button></DialogActions>
    </Dialog>
  </Container>;
};

export default AdminPlatformUpdatesPage;
