import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LaunchIcon from '@mui/icons-material/Launch';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveIcon from '@mui/icons-material/Save';
import SyncIcon from '@mui/icons-material/Sync';
import apiClient from '../apiClient';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';

type Partner = { id: string; name: string };
type IndexedPage = { canonical_url: string; title: string; chunks: number; fetched_at: string };
type Settings = {
  business_partner_id: string;
  business_partner_name: string;
  site_key?: string;
  is_enabled: boolean;
  source_url: string;
  url_businesspartner?: string;
  allowed_origins?: string[];
  assistant_name: string;
  welcome_message: string;
  avatar_key: 'female' | 'male';
  max_pages: number;
  daily_question_limit: number;
  monthly_token_limit: number;
  last_crawled_at?: string | null;
  last_crawl_status: 'not_started' | 'running' | 'success' | 'failed';
  last_crawl_error?: string | null;
  indexed_pages: number;
  document_chunks: number;
  questions_today: number;
  tokens_this_month: number | string;
  embed_code?: string;
};

const assistantAvatars = [
  { key: 'female' as const, label: 'Weiblicher Avatar', src: '/ki-avatar-w.png' },
  { key: 'male' as const, label: 'Männlicher Avatar', src: '/ki-avatar-m.png' },
];

const statusLabel: Record<Settings['last_crawl_status'], string> = {
  not_started: 'Noch nicht synchronisiert',
  running: 'Synchronisierung läuft',
  success: 'Quellen aktuell',
  failed: 'Synchronisierung fehlgeschlagen',
};

const AdminPublicAssistantPage: React.FC = () => {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pages, setPages] = useState<IndexedPage[]>([]);
  const [originsText, setOriginsText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    apiClient.get('/api/admin/business-partners')
      .then((response) => {
        const options = Array.isArray(response.data) ? response.data : [];
        setPartners(options.map((partner: any) => ({ id: partner.id, name: partner.name })));
        setPartnerId((current) => current || options[0]?.id || '');
      })
      .catch(() => setError('Mandanten konnten nicht geladen werden.'));
  }, [isAdmin]);

  const query = useCallback(() => isAdmin && partnerId ? `?businessPartnerId=${encodeURIComponent(partnerId)}` : '', [isAdmin, partnerId]);

  const load = useCallback(async (quiet = false) => {
    if (isAdmin && !partnerId) { setLoading(false); return; }
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [settingsResponse, pagesResponse] = await Promise.all([
        apiClient.get(`/api/admin/public-assistant${query()}`),
        apiClient.get(`/api/admin/public-assistant/pages${query()}`),
      ]);
      setSettings({
        ...settingsResponse.data,
        avatar_key: settingsResponse.data.avatar_key === 'male' ? 'male' : 'female',
      });
      setOriginsText((settingsResponse.data.allowed_origins || []).join('\n'));
      setPages(Array.isArray(pagesResponse.data) ? pagesResponse.data : []);
      setSyncing(settingsResponse.data.last_crawl_status === 'running');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Assistent-Einstellungen konnten nicht geladen werden.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [isAdmin, partnerId, query]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!syncing) return;
    const timer = window.setInterval(() => { void load(true); }, 3000);
    return () => window.clearInterval(timer);
  }, [syncing, load]);

  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      const allowedOrigins = isAdmin
        ? originsText.split(/\r?\n|,/).map((origin) => origin.trim()).filter(Boolean)
        : undefined;
      const response = await apiClient.put(`/api/admin/public-assistant${query()}`, {
        businessPartnerId: isAdmin ? partnerId : undefined,
        isEnabled: settings.is_enabled,
        sourceUrl: settings.source_url,
        allowedOrigins,
        assistantName: settings.assistant_name,
        welcomeMessage: settings.welcome_message,
        avatarKey: settings.avatar_key,
        maxPages: settings.max_pages,
        dailyQuestionLimit: settings.daily_question_limit,
        monthlyTokenLimit: settings.monthly_token_limit,
      });
      setSettings({
        ...response.data,
        avatar_key: response.data.avatar_key === 'male' ? 'male' : 'female',
      });
      setOriginsText((response.data.allowed_origins || []).join('\n'));
      showSnackbar('Assistent-Einstellungen gespeichert.', 'success');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Einstellungen konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    setError('');
    try {
      await apiClient.post(`/api/admin/public-assistant/sync${query()}`, { businessPartnerId: isAdmin ? partnerId : undefined });
      showSnackbar('Homepage-Synchronisierung gestartet.', 'info');
      await load(true);
    } catch (requestError: any) {
      setSyncing(false);
      setError(requestError?.response?.data?.message || 'Synchronisierung konnte nicht gestartet werden.');
    }
  };

  const copy = async (value: string, message: string) => {
    await navigator.clipboard.writeText(value);
    showSnackbar(message, 'success');
  };

  const rotateKey = async () => {
    if (!window.confirm('Der bisherige Einbettungscode funktioniert danach nicht mehr. Schlüssel wirklich erneuern?')) return;
    try {
      const response = await apiClient.post(`/api/admin/public-assistant/rotate-site-key${query()}`, { businessPartnerId: isAdmin ? partnerId : undefined });
      setSettings(response.data);
      showSnackbar('Einbettungsschlüssel erneuert.', 'success');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Schlüssel konnte nicht erneuert werden.');
    }
  };

  if (loading) return <Box sx={{ minHeight: 280, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center"><AutoAwesomeIcon color="primary" /><Typography variant="h4" fontWeight={900}>Homepage-Assistent</Typography></Stack>
          <Typography color="text.secondary">Öffentliche KI-Antworten ausschließlich aus freigegebenen Inhalten der Mandanten-Homepage.</Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} onClick={() => void load()}>Aktualisieren</Button>
      </Stack>

      {isAdmin && (
        <TextField select fullWidth label="Mandant" value={partnerId} onChange={(event) => setPartnerId(event.target.value)} sx={{ mb: 3, maxWidth: 520 }}>
          {partners.map((partner) => <MenuItem key={partner.id} value={partner.id}>{partner.name}</MenuItem>)}
        </TextField>
      )}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {settings && (
        <Stack spacing={3}>
          <Grid container spacing={2}>
            {[
              ['Indexierte Seiten', settings.indexed_pages],
              ['Textabschnitte', settings.document_chunks],
              ['Fragen heute', `${settings.questions_today} / ${settings.daily_question_limit}`],
              ['Tokens diesen Monat', `${Number(settings.tokens_this_month || 0).toLocaleString('de-DE')} / ${Number(settings.monthly_token_limit).toLocaleString('de-DE')}`],
            ].map(([label, value]) => (
              <Grid item xs={12} sm={6} md={3} key={String(label)}><Card variant="outlined"><CardContent><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h6" fontWeight={900}>{value}</Typography></CardContent></Card></Grid>
            ))}
          </Grid>

          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight={900}>1. Verhalten und Freigabe</Typography>
                <Typography variant="body2" color="text.secondary">
                  {isAdmin
                    ? 'Nach Aktivierung erscheint derselbe Assistent automatisch auf der mandantenspezifischen Public Page. Für WordPress und weitere Websites steht unten zusätzlich der Einbettungscode bereit.'
                    : 'Nach Aktivierung erscheint der Assistent automatisch auf der mandantenspezifischen Public Page. Die Einbindung auf externen Websites wird durch den Systemadmin verwaltet.'}
                </Typography>
              </Box>
              <FormControlLabel control={<Switch checked={settings.is_enabled} onChange={(event) => change('is_enabled', event.target.checked)} />} label={settings.is_enabled ? 'Öffentlich aktiv' : 'Deaktiviert'} />
            </Stack>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}><TextField fullWidth label="Name des Assistenten" value={settings.assistant_name} onChange={(event) => change('assistant_name', event.target.value)} inputProps={{ maxLength: 120 }} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Begrüßung" value={settings.welcome_message} onChange={(event) => change('welcome_message', event.target.value)} inputProps={{ maxLength: 500 }} /></Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>Avatar des Assistenten</Typography>
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  {assistantAvatars.map((avatar) => {
                    const selected = settings.avatar_key === avatar.key;
                    return (
                      <ButtonBase
                        key={avatar.key}
                        onClick={() => change('avatar_key', avatar.key)}
                        aria-pressed={selected}
                        aria-label={`${avatar.label}${selected ? ', ausgewählt' : ''}`}
                        sx={{
                          width: { xs: '100%', sm: 210 },
                          p: 1.25,
                          border: '2px solid',
                          borderColor: selected ? 'primary.main' : 'divider',
                          borderRadius: 2.5,
                          justifyContent: 'flex-start',
                          gap: 1.25,
                          bgcolor: selected ? 'action.selected' : 'background.paper',
                        }}
                      >
                        <Box component="img" src={avatar.src} alt="" sx={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center top', bgcolor: '#fff' }} />
                        <Box sx={{ textAlign: 'left' }}>
                          <Typography fontWeight={800}>{avatar.label}</Typography>
                          <Typography variant="caption" color={selected ? 'primary.main' : 'text.secondary'}>{selected ? 'Ausgewählt' : 'Auswählen'}</Typography>
                        </Box>
                      </ButtonBase>
                    );
                  })}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Wird auf der Public Page und bei externer Einbettung angezeigt.</Typography>
              </Grid>
              <Grid item xs={12}><TextField fullWidth label="Homepage-Quelle" value={settings.source_url || ''} onChange={(event) => change('source_url', event.target.value)} helperText={`Muss zur hinterlegten Mandanten-Homepage gehören: ${settings.url_businesspartner || 'noch nicht definiert'}`} /></Grid>
              {isAdmin && <Grid item xs={12}><TextField fullWidth multiline minRows={2} label="Erlaubte Einbettungs-Domains" value={originsText} onChange={(event) => setOriginsText(event.target.value)} placeholder="https://beispiel.at" helperText="Eine HTTPS-Origin pro Zeile, ohne Pfad. Bei der hinterlegten Mandanten-Homepage werden www und die Variante ohne www automatisch gemeinsam freigegeben." /></Grid>}
              <Grid item xs={12} sm={4}><TextField type="number" fullWidth label="Maximale Seiten" value={settings.max_pages} onChange={(event) => change('max_pages', Number(event.target.value))} inputProps={{ min: 1, max: 100 }} /></Grid>
              <Grid item xs={12} sm={4}><TextField type="number" fullWidth label="Fragen pro Tag" value={settings.daily_question_limit} onChange={(event) => change('daily_question_limit', Number(event.target.value))} inputProps={{ min: 1, max: 100000 }} /></Grid>
              <Grid item xs={12} sm={4}><TextField type="number" fullWidth label="Tokens pro Monat" value={settings.monthly_token_limit} onChange={(event) => change('monthly_token_limit', Number(event.target.value))} inputProps={{ min: 1000, max: 1000000000 }} /></Grid>
            </Grid>
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}><Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} onClick={() => void save()} disabled={saving}>Speichern</Button></Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
              <Box>
                <Typography variant="h6" fontWeight={900}>2. Homepage einlesen</Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                  <Chip label={statusLabel[settings.last_crawl_status]} color={settings.last_crawl_status === 'success' ? 'success' : settings.last_crawl_status === 'failed' ? 'error' : 'default'} />
                  {settings.last_crawled_at && <Typography variant="caption">Stand: {new Date(settings.last_crawled_at).toLocaleString('de-AT')}</Typography>}
                </Stack>
              </Box>
              <Button variant="outlined" startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />} onClick={() => void sync()} disabled={syncing || saving}>{syncing ? 'Synchronisierung läuft …' : 'Jetzt synchronisieren'}</Button>
            </Stack>
            {settings.last_crawl_error && <Alert severity="error" sx={{ mt: 2 }}>{settings.last_crawl_error}</Alert>}
            {!!pages.length && (
              <Box sx={{ mt: 2, maxHeight: 260, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                {pages.map((page, index) => (
                  <Box key={page.canonical_url} sx={{ p: 1.25, borderBottom: index < pages.length - 1 ? '1px solid' : 0, borderColor: 'divider' }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                      <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={800} noWrap>{page.title || page.canonical_url}</Typography><Typography variant="caption" color="text.secondary" noWrap display="block">{page.canonical_url}</Typography></Box>
                      <Chip size="small" label={`${page.chunks} Abschnitte`} />
                    </Stack>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>

          {isAdmin && <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Typography variant="h6" fontWeight={900}>3. Website-Einbettung</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Die Public Page benötigt diesen Code nicht: Dort wird der aktivierte Assistent automatisch eingebunden. Für WordPress kommt der Code in einen „Individuelles HTML“-Block; auf jeder normalen HTML-Seite direkt vor das schließende <code>&lt;/body&gt;</code>. Vorher muss die Website-Domain oben erlaubt und gespeichert sein.</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField fullWidth value={settings.embed_code || ''} InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 13 } }} />
              <Tooltip title="Einbettungscode kopieren"><IconButton onClick={() => void copy(settings.embed_code || '', 'Einbettungscode kopiert.')}><ContentCopyIcon /></IconButton></Tooltip>
              <Tooltip title="Vorschau öffnen"><span><IconButton component="a" href={`/assistant/${settings.site_key}`} target="_blank" disabled={!settings.is_enabled || !settings.site_key}><LaunchIcon /></IconButton></span></Tooltip>
              <Tooltip title="Schlüssel erneuern"><IconButton color="warning" onClick={() => void rotateKey()}><RestartAltIcon /></IconButton></Tooltip>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Alert severity="info">Die KI verwendet öffentlich ausschließlich die oben indexierten Homepage-Seiten. Interne Dateien, Community-Inhalte und Mitgliederprofile sind ausgeschlossen.</Alert>
          </Paper>}
        </Stack>
      )}
    </Container>
  );
};

export default AdminPublicAssistantPage;
