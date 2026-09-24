import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RssFeedOutlinedIcon from '@mui/icons-material/RssFeedOutlined';
import apiClient from '../apiClient';
import type { SalesEntitlements } from './AccountRadarTools';

interface ExternalSource {
  id: string;
  name: string;
  url_pattern: string;
  account_radar_requested_url: string;
  account_radar_source_type: 'rss' | 'website';
  region: string;
  is_active: boolean;
  last_scraped_at?: string | null;
  entry_count: number;
  last_job_status?: string | null;
  last_error?: string | null;
  status: 'active' | 'error' | 'pending_configuration' | 'paused';
}

interface Props {
  open: boolean;
  onClose: () => void;
  entitlements: SalesEntitlements;
  onChanged?: () => void;
}

const statusMeta: Record<ExternalSource['status'], { label: string; color: 'success' | 'error' | 'warning' | 'default' }> = {
  active: { label: 'Aktiv', color: 'success' },
  error: { label: 'Prüfung fehlgeschlagen', color: 'error' },
  pending_configuration: { label: 'Admin-Konfiguration nötig', color: 'warning' },
  paused: { label: 'Pausiert', color: 'default' },
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Noch nicht geprüft';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Noch nicht geprüft';
  return new Intl.DateTimeFormat('de-AT', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const AccountRadarSourceDialog: React.FC<Props> = ({ open, onClose, entitlements, onChanged }) => {
  const [sources, setSources] = useState<ExternalSource[]>([]);
  const [usage, setUsage] = useState({ current: 0, limit: entitlements.limits.externalSources || 0 });
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [region, setRegion] = useState('DACH');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const included = Boolean(entitlements.features.externalSources);

  const loadSources = useCallback(async () => {
    if (!open || !included) return;
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await apiClient.get<any>('/api/account-radar/sources');
      if (!res.ok) throw new Error(data?.message || 'Beobachtete Quellen konnten nicht geladen werden.');
      setSources(Array.isArray(data?.sources) ? data.sources : []);
      setUsage(data?.usage || { current: 0, limit: entitlements.limits.externalSources || 0 });
    } catch (cause: any) {
      setError(cause?.message || 'Beobachtete Quellen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [entitlements.limits.externalSources, included, open]);

  useEffect(() => {
    if (open) {
      setNotice(null);
      setError(null);
      loadSources();
    }
  }, [loadSources, open]);

  const createSource = async () => {
    setCreating(true);
    setNotice(null);
    setError(null);
    try {
      const { res, data } = await apiClient.post<any>('/api/account-radar/sources', { name, url, region });
      if (!res.ok) throw new Error(data?.message || 'Quelle konnte nicht angelegt werden.');
      setNotice([data?.message, data?.warning].filter(Boolean).join(' '));
      setName('');
      setUrl('');
      await loadSources();
      onChanged?.();
    } catch (cause: any) {
      setError(cause?.message || 'Quelle konnte nicht angelegt werden.');
    } finally {
      setCreating(false);
    }
  };

  const runSource = async (source: ExternalSource) => {
    setBusyId(source.id);
    setNotice(null);
    setError(null);
    try {
      const { res, data } = await apiClient.post<any>(`/api/account-radar/sources/${source.id}/run`, {});
      if (!res.ok) throw new Error(data?.message || 'Prüfung konnte nicht gestartet werden.');
      setNotice(data?.message || 'Prüfung wurde gestartet.');
      await loadSources();
    } catch (cause: any) {
      setError(cause?.message || 'Prüfung konnte nicht gestartet werden.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleSource = async (source: ExternalSource, enabled: boolean) => {
    setBusyId(source.id);
    setNotice(null);
    setError(null);
    try {
      const { res, data } = await apiClient.request<any>(`/api/account-radar/sources/${source.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(data?.message || 'Status konnte nicht geändert werden.');
      setNotice(data?.message || 'Status wurde geändert.');
      await loadSources();
      onChanged?.();
    } catch (cause: any) {
      setError(cause?.message || 'Status konnte nicht geändert werden.');
    } finally {
      setBusyId(null);
    }
  };

  const removeSource = async (source: ExternalSource) => {
    if (!window.confirm(`Quelle „${source.name}“ entfernen? Bereits importierte Inhalte bleiben erhalten.`)) return;
    setBusyId(source.id);
    setNotice(null);
    setError(null);
    try {
      const { res, data } = await apiClient.delete<any>(`/api/account-radar/sources/${source.id}`);
      if (!res.ok) throw new Error(data?.message || 'Quelle konnte nicht entfernt werden.');
      setNotice(data?.message || 'Quelle wurde entfernt.');
      await loadSources();
      onChanged?.();
    } catch (cause: any) {
      setError(cause?.message || 'Quelle konnte nicht entfernt werden.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onClose={creating ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 7 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <RssFeedOutlinedIcon color="info" />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 950 }}>Beobachtete Quellen</Typography>
            <Typography variant="caption" color="text.secondary">Websites und Feeds liefern Informationen für Accounts und Sales-Trigger</Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose} aria-label="Schließen" sx={{ position: 'absolute', right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!included ? (
          <Alert severity="info">
            Beobachtete Quellen sind in Sales Premium enthalten. Dort stehen bis zu 25 mandanteneigene RSS-, Atom- oder Website-Quellen zur Verfügung.
          </Alert>
        ) : (
          <Stack spacing={2}>
            <Alert severity="info">
              <strong>Accounts sind Ihre Vertriebsziele. Beobachtete Quellen sind die Informationslieferanten.</strong> Ein Feed oder eine Website kann Signale zu mehreren Accounts oder allgemeine Markttreffer liefern. RSS/Atom wird automatisch erkannt und täglich geprüft. Bei einer normalen Website legt das System einen sicheren Konfigurationsauftrag an; der Admin hinterlegt einmalig die HTML-Selektoren. Die Erkennung ist regelbasiert und verbraucht keine KI-Tokens. LinkedIn wird nicht automatisiert ausgelesen.
            </Alert>
            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
            {notice && <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert>}

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} alignItems={{ md: 'flex-start' }}>
                <TextField label="Quellenname" value={name} onChange={(event) => setName(event.target.value)} inputProps={{ maxLength: 120 }} fullWidth disabled={creating} />
                <TextField label="Website- oder Feed-URL" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.beispiel.at/news" fullWidth disabled={creating} />
                <TextField select label="Region" value={region} onChange={(event) => setRegion(event.target.value)} sx={{ minWidth: { md: 125 } }} disabled={creating}>
                  <MenuItem value="DACH">DACH</MenuItem><MenuItem value="AT">AT</MenuItem><MenuItem value="DE">DE</MenuItem><MenuItem value="EU">EU</MenuItem><MenuItem value="GLOBAL">Global</MenuItem>
                </TextField>
                <Button
                  variant="contained"
                  color="info"
                  startIcon={creating ? <CircularProgress size={18} color="inherit" /> : <RssFeedOutlinedIcon />}
                  onClick={createSource}
                  disabled={creating || name.trim().length < 2 || !url.trim() || usage.current >= usage.limit}
                  sx={{ minHeight: 56, minWidth: 190, whiteSpace: 'nowrap' }}
                >
                  {creating ? 'Quelle wird geprüft …' : 'Prüfen & hinzufügen'}
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {usage.current} von {usage.limit} beobachteten Quellen eingerichtet
              </Typography>
            </Paper>

            <Divider />
            {loading ? (
              <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={30} /></Box>
            ) : sources.length === 0 ? (
              <Alert severity="info">Noch keine Quelle zur Beobachtung eingerichtet. Starten Sie am besten mit einem offiziellen RSS-/Atom-Feed oder einer Presse-Seite.</Alert>
            ) : (
              <Stack spacing={1.2}>
                {sources.map((source) => {
                  const meta = statusMeta[source.status] || statusMeta.paused;
                  const busy = busyId === source.id;
                  return (
                    <Paper key={source.id} variant="outlined" sx={{ p: 1.6, borderRadius: 3 }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" alignItems="center">
                            <Typography sx={{ fontWeight: 900 }}>{source.name}</Typography>
                            <Chip size="small" color={meta.color} label={meta.label} />
                            <Chip size="small" variant="outlined" label={source.account_radar_source_type === 'rss' ? 'RSS/Atom' : 'Website'} />
                            <Chip size="small" variant="outlined" label={`${source.entry_count} Inhalte`} />
                          </Stack>
                          <Link href={source.account_radar_requested_url || source.url_pattern} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, mt: 0.5, maxWidth: '100%', overflowWrap: 'anywhere' }}>
                            {source.account_radar_requested_url || source.url_pattern}<OpenInNewIcon sx={{ fontSize: 15, flexShrink: 0 }} />
                          </Link>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Letzte Prüfung: {formatDate(source.last_scraped_at)} · Region: {source.region || 'DACH'}
                          </Typography>
                          {source.status === 'pending_configuration' && (
                            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
                              Die Quelle wartet auf HTML-Selektoren unter <Link href="/admin/scraping-rules" color="inherit" underline="always">Admin → Scraping-Regeln</Link>.
                            </Typography>
                          )}
                          {source.last_error && <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>{source.last_error}</Typography>}
                        </Box>
                        <Stack direction="row" spacing={0.4} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Tooltip title={source.is_active ? 'Quelle pausieren' : 'Quelle aktivieren'}>
                            <span><Switch checked={source.is_active} onChange={(_, checked) => toggleSource(source, checked)} disabled={busy || source.status === 'pending_configuration'} /></span>
                          </Tooltip>
                          <Tooltip title="Jetzt prüfen"><span><IconButton onClick={() => runSource(source)} disabled={busy || !source.is_active}><PlayArrowIcon /></IconButton></span></Tooltip>
                          <Tooltip title="Quelle entfernen"><span><IconButton color="error" onClick={() => removeSource(source)} disabled={busy}><DeleteOutlineIcon /></IconButton></span></Tooltip>
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Schließen</Button></DialogActions>
    </Dialog>
  );
};

export default AccountRadarSourceDialog;
