import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import KeyIcon from '@mui/icons-material/Key';
import SyncIcon from '@mui/icons-material/Sync';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import apiClient from '../apiClient';
import type { SalesEntitlements } from './AccountRadarTools';

interface QualityIssue {
  key: string;
  label: string;
  severity: 'error' | 'warning' | 'info';
  count: number;
}

interface QualityResult {
  message?: string;
  score: number;
  generatedAt: string;
  counts: Record<string, number>;
  issues: QualityIssue[];
  recentSyncs: Array<{
    operation: string;
    resource_type: string;
    response_status: number;
    duration_ms: number | null;
    created_at: string;
  }>;
}

interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface TokenResponse {
  message?: string;
  tokens: ApiToken[];
  allowedScopes: string[];
  limit: number;
  active: number;
  apiBaseUrl: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  entitlements: SalesEntitlements;
}

const SCOPE_LABELS: Record<string, string> = {
  'accounts:read': 'Accounts lesen',
  'accounts:write': 'Accounts schreiben',
  'tasks:read': 'Aufgaben lesen',
  'tasks:write': 'Aufgaben schreiben',
  'analytics:read': 'Auswertungen lesen',
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Noch nie';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '–' : date.toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' });
};

const AccountRadarIntegrationDialog: React.FC<Props> = ({ open, onClose, entitlements }) => {
  const [quality, setQuality] = useState<QualityResult | null>(null);
  const [tokens, setTokens] = useState<TokenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState('CRM-Synchronisierung');
  const [duration, setDuration] = useState(90);
  const [scopes, setScopes] = useState<string[]>(['accounts:read', 'accounts:write', 'tasks:read', 'tasks:write']);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  const apiOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  const apiBase = `${apiOrigin}${tokens?.apiBaseUrl || '/api/integrations/account-radar/v1'}`;
  const activeTokenCount = tokens?.active || 0;
  const canCreateToken = entitlements.features.apiIntegration
    && activeTokenCount < (entitlements.limits.apiTokens || 0);
  const qualityColor = useMemo(() => (
    (quality?.score || 0) >= 85 ? 'success' : (quality?.score || 0) >= 65 ? 'warning' : 'error'
  ), [quality?.score]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qualityResult = await apiClient.get<QualityResult>('/api/account-radar/data-quality');
      if (!qualityResult.res.ok || !qualityResult.data) throw new Error(qualityResult.data?.message || 'Datenqualität konnte nicht geladen werden.');
      setQuality(qualityResult.data);
      if (entitlements.features.apiIntegration) {
        const tokenResult = await apiClient.get<TokenResponse>('/api/account-radar/integrations/tokens');
        if (!tokenResult.res.ok || !tokenResult.data) throw new Error(tokenResult.data?.message || 'API-Tokens konnten nicht geladen werden.');
        setTokens(tokenResult.data);
      } else {
        setTokens(null);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Integrationseinstellungen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const toggleScope = (scope: string, checked: boolean) => {
    setScopes((current) => checked
      ? Array.from(new Set([...current, scope]))
      : current.filter((item) => item !== scope));
  };

  const createToken = async () => {
    setCreating(true);
    setError(null);
    setNotice(null);
    setNewToken(null);
    try {
      const { res, data } = await apiClient.post<any>('/api/account-radar/integrations/tokens', {
        name: tokenName,
        expires_in_days: duration,
        scopes,
      });
      if (!res.ok) throw new Error(data?.message || 'API-Token konnte nicht erstellt werden.');
      setNewToken(String(data?.token || ''));
      setNotice('Token erstellt. Jetzt kopieren – es wird nur dieses eine Mal vollständig angezeigt.');
      await load();
    } catch (createError: any) {
      setError(createError?.message || 'API-Token konnte nicht erstellt werden.');
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = async (token: ApiToken) => {
    if (!window.confirm(`API-Token „${token.name}“ wirklich widerrufen? Die verbundene Anwendung verliert sofort den Zugriff.`)) return;
    setError(null);
    try {
      const { res, data } = await apiClient.delete<any>(`/api/account-radar/integrations/tokens/${token.id}`);
      if (!res.ok) throw new Error(data?.message || 'API-Token konnte nicht widerrufen werden.');
      setNotice('API-Token wurde widerrufen.');
      await load();
    } catch (revokeError: any) {
      setError(revokeError?.message || 'API-Token konnte nicht widerrufen werden.');
    }
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} kopiert.`);
  };

  return (<>
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 900, pr: 7 }}>
        <Stack direction="row" spacing={0.7} alignItems="center">
          <span>Datenqualität &amp; Integrationen</span>
          <Tooltip title="Berechnung und sichere Nutzung erklären">
            <IconButton size="small" onClick={() => setInfoOpen(true)} aria-label="Informationen zu Datenqualität und Integrationen">
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <IconButton onClick={onClose} aria-label="Dialog schließen" sx={{ position: 'absolute', right: 12, top: 10 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 2 }}>{notice}</Alert>}

        {quality && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
              <Box sx={{ minWidth: 118, textAlign: 'center' }}>
                <Typography variant="h3" color={`${qualityColor}.main`} sx={{ fontWeight: 950 }}>{quality.score}</Typography>
                <Typography variant="caption" color="text.secondary">von 100 Punkten</Typography>
              </Box>
              <Box sx={{ flexGrow: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <VerifiedOutlinedIcon color={qualityColor as any} />
                  <Typography variant="h6" sx={{ fontWeight: 900 }}>Qualität der Sales-Daten</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {quality.counts.accounts || 0} aktive Accounts · geprüft am {formatDate(quality.generatedAt)}
                </Typography>
                <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap sx={{ mt: 1.2 }}>
                  {quality.issues.length
                    ? quality.issues.map((issue) => <Chip key={issue.key} size="small" color={issue.severity} variant="outlined" label={`${issue.count} × ${issue.label}`} />)
                    : <Chip size="small" color="success" label="Keine wesentlichen Datenlücken erkannt" />}
                </Stack>
              </Box>
            </Stack>
          </Paper>
        )}

        <Divider sx={{ my: 3 }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <KeyIcon color="primary" />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>Dauerhafte API-Anbindung</Typography>
            <Typography variant="body2" color="text.secondary">Für CRM, Verlags- oder BI-Systeme. Jeder Zugriff bleibt auf diesen Mandanten begrenzt.</Typography>
          </Box>
          <Chip label={entitlements.features.apiIntegration ? `Premium · ${activeTokenCount}/${entitlements.limits.apiTokens}` : 'Premium-Funktion'} color={entitlements.features.apiIntegration ? 'success' : 'default'} />
        </Stack>

        {!entitlements.features.apiIntegration ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            Sales Basic enthält manuellen CSV-Export und die Datenqualitätsprüfung. Automatische API-Synchronisierung, schreibender Zugriff und Analytics-Export sind in Sales Premium enthalten.
          </Alert>
        ) : (
          <Stack spacing={2.2} sx={{ mt: 2 }}>
            {newToken && (
              <Alert severity="warning" icon={<KeyIcon />}>
                <Typography sx={{ fontWeight: 900 }}>Nur einmal sichtbar</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                  <TextField value={newToken} fullWidth size="small" InputProps={{ readOnly: true }} />
                  <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={() => copy(newToken, 'API-Token')}>Kopieren</Button>
                </Stack>
              </Alert>
            )}

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography sx={{ fontWeight: 900 }}>Neues Token</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
                <TextField label="Bezeichnung" value={tokenName} onChange={(event) => setTokenName(event.target.value)} fullWidth inputProps={{ maxLength: 120 }} />
                <TextField select label="Laufzeit" value={duration} onChange={(event) => setDuration(Number(event.target.value))} sx={{ minWidth: { sm: 160 } }}>
                  {[30, 90, 180, 365].map((days) => <MenuItem key={days} value={days}>{days} Tage</MenuItem>)}
                </TextField>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                {(tokens?.allowedScopes || Object.keys(SCOPE_LABELS)).map((scope) => (
                  <FormControlLabel
                    key={scope}
                    control={<Checkbox size="small" checked={scopes.includes(scope)} onChange={(event) => toggleScope(scope, event.target.checked)} />}
                    label={SCOPE_LABELS[scope] || scope}
                  />
                ))}
              </Stack>
              <Button variant="contained" startIcon={<KeyIcon />} onClick={createToken} disabled={!canCreateToken || !tokenName.trim() || !scopes.length || creating} sx={{ mt: 1 }}>
                {creating ? <CircularProgress size={20} color="inherit" /> : 'Token einmalig erzeugen'}
              </Button>
            </Paper>

            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <Box sx={{ p: 2 }}>
                <Typography sx={{ fontWeight: 900 }}>Vorhandene Tokens</Typography>
              </Box>
              <Divider />
              <Stack divider={<Divider flexItem />}>
                {tokens?.tokens.map((token) => {
                  const inactive = Boolean(token.revoked_at) || new Date(token.expires_at) <= new Date();
                  return (
                    <Stack key={token.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" sx={{ p: 1.5 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 850 }}>{token.name} · {token.token_prefix}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {token.scopes.map((scope) => SCOPE_LABELS[scope] || scope).join(', ')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Letzte Nutzung: {formatDate(token.last_used_at)} · gültig bis {formatDate(token.expires_at)}</Typography>
                      </Box>
                      {inactive
                        ? <Chip size="small" label={token.revoked_at ? 'Widerrufen' : 'Abgelaufen'} />
                        : <Button color="error" size="small" startIcon={<DeleteOutlineIcon />} onClick={() => revokeToken(token)}>Widerrufen</Button>}
                    </Stack>
                  );
                })}
                {!tokens?.tokens.length && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Noch kein API-Token angelegt.</Typography>}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <SyncIcon color="primary" />
                <Typography sx={{ fontWeight: 900 }}>Endpunkte & Synchronisierung</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Bearer-Token im Authorization-Header senden. Listen unterstützen <code>limit</code>, <code>offset</code> und <code>updated_since</code>. Schreibzugriffe sind über die externe ID idempotent.
              </Typography>
              <Stack spacing={0.8} sx={{ mt: 1.5 }}>
                {[
                  ['GET', `${apiBase}/accounts`],
                  ['PUT', `${apiBase}/accounts/{external_id}`],
                  ['GET', `${apiBase}/tasks`],
                  ['PUT', `${apiBase}/tasks/{external_id}`],
                  ['GET', `${apiBase}/analytics?period_days=30`],
                ].map(([method, url]) => (
                  <Stack key={`${method}-${url}`} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                    <Chip size="small" label={method} color={method === 'PUT' ? 'warning' : 'info'} sx={{ width: 54 }} />
                    <Typography component="code" variant="caption" sx={{ overflowWrap: 'anywhere', flexGrow: 1 }}>{url}</Typography>
                    <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => copy(url, 'Endpunkt')}>Kopieren</Button>
                  </Stack>
                ))}
              </Stack>
              <Alert severity="info" sx={{ mt: 1.5 }}>120 Anfragen pro Minute und Token. Tokens werden nur gehasht gespeichert, können einzeln widerrufen werden und laufen spätestens nach 365 Tagen ab.</Alert>
            </Paper>

            {!!quality?.recentSyncs.length && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Typography sx={{ fontWeight: 900 }}>Letzte API-Zugriffe</Typography>
                <Stack spacing={0.7} sx={{ mt: 1 }}>
                  {quality.recentSyncs.slice(0, 5).map((sync, index) => (
                    <Stack key={`${sync.created_at}-${index}`} direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="caption">{sync.operation} · {sync.resource_type}</Typography>
                      <Typography variant="caption" color={sync.response_status < 400 ? 'success.main' : 'error.main'}>{sync.response_status} · {formatDate(sync.created_at)}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Schließen</Button>
        <Button onClick={load} disabled={loading}>Neu prüfen</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 7, fontWeight: 900 }}>
        So funktionieren Datenqualität &amp; Integrationen
        <IconButton onClick={() => setInfoOpen(false)} aria-label="Informationen schließen" sx={{ position: 'absolute', right: 12, top: 10 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography fontWeight={900}>Mandantenweite Datenqualität</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Der Wert prüft aktive Accounts und offene Aufgaben. Abzüge entstehen unter anderem durch doppelte Domains, fehlende Websites, fehlende Verantwortliche oder Ansprechpartner, überfällige Aufgaben und ungepflegte Pipeline-Werte.
            </Typography>
          </Box>
          <Box>
            <Typography fontWeight={900}>Qualität eines einzelnen Accounts</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Im Account-Detail zeigt ein eigenes Diagramm, welche Kernangaben für diesen Account vollständig sind. Der Einzelwert und der mandantenweite Wert haben deshalb bewusst unterschiedliche Grundlagen.
            </Typography>
          </Box>
          <Alert severity="info">Sales Basic enthält Qualitätsprüfung und manuellen CSV-Export. Automatische API-Synchronisierung, Analytics-Export und API-Tokens sind Premium-Funktionen.</Alert>
          <Alert severity="warning">API-Tokens wie Passwörter behandeln: nur einmal kopieren, sicher ablegen, kleinste notwendige Berechtigungen wählen und nicht per unverschlüsselter E-Mail versenden.</Alert>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={() => setInfoOpen(false)} variant="contained">Verstanden</Button></DialogActions>
    </Dialog>
  </>);
};

export default AccountRadarIntegrationDialog;
