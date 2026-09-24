import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Link,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import apiClient from '../apiClient';
import type { SalesEntitlements } from './AccountRadarTools';

interface TriggerTemplate {
  key: string;
  name: string;
  description: string;
  keywords: string[];
}

interface TriggerProfile {
  id: string;
  template_key: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  include_keywords: string[];
  exclude_keywords: string[];
  scope_mode: TriggerScopeMode;
  account_ids: string[];
  include_competitors: boolean;
  lookback_days: number;
  min_content_relevance: number;
  match_count?: number;
  last_match_at?: string | null;
  recent_market_matches?: Array<{
    title: string;
    original_url: string;
    published_at: string;
    matched_keywords: string[];
    match_score: number;
  }>;
}

type TriggerScopeMode = 'unassigned' | 'all' | 'selected';

interface TriggerAccount {
  id: string;
  name: string;
  competitor_count: number;
}

interface TriggerForm {
  id?: string;
  template_key?: string | null;
  name: string;
  description: string;
  is_active: boolean;
  include_keywords: string;
  exclude_keywords: string;
  scope_mode: TriggerScopeMode;
  account_ids: string[];
  include_competitors: boolean;
  lookback_days: number;
  min_content_relevance: number;
}

interface TriggerPreview {
  scanned: number;
  accountCount: number;
  scopeMode: TriggerScopeMode;
  keywordMatchesWithoutAccount: number;
  unassignedKeywordMatches?: Array<{
    title: string;
    original_url: string;
    published_at: string;
    matched_keywords: string[];
  }>;
  limitReached: boolean;
  matches: Array<{
    account_id: string | null;
    account_name: string | null;
    competitor_name?: string | null;
    title: string;
    original_url: string;
    published_at: string;
    matched_keywords: string[];
    match_score: number;
  }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  entitlements: SalesEntitlements;
  onImported: () => void;
  initialProfileId?: string | null;
  initialKeyword?: string | null;
}

const emptyForm: TriggerForm = {
  name: '',
  description: '',
  is_active: true,
  include_keywords: '',
  exclude_keywords: '',
  scope_mode: 'all',
  account_ids: [],
  include_competitors: false,
  lookback_days: 30,
  min_content_relevance: 0,
};

const termsToText = (terms?: string[]) => (terms || []).join('\n');
const parseTerms = (value: string) => Array.from(new Set(
  String(value || '')
    .split(/[\n,;]/)
    .map((term) => term.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
));
const dateLabel = (value?: string | null) => {
  if (!value) return 'Noch kein Treffer';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Noch kein Treffer' : `Zuletzt ${date.toLocaleDateString('de-AT')}`;
};

const AccountRadarTriggerDialog: React.FC<Props> = ({ open, onClose, entitlements, onImported, initialProfileId = null, initialKeyword = null }) => {
  const premium = entitlements.features.contentTriggers;
  const [profiles, setProfiles] = useState<TriggerProfile[]>([]);
  const [templates, setTemplates] = useState<TriggerTemplate[]>([]);
  const [accounts, setAccounts] = useState<TriggerAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<TriggerForm>(emptyForm);
  const [preview, setPreview] = useState<TriggerPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusedKeyword, setFocusedKeyword] = useState<string | null>(null);
  const handledTargetRef = useRef('');

  const activeCount = useMemo(() => profiles.filter((profile) => profile.is_active).length, [profiles]);
  const includeTermCount = useMemo(() => parseTerms(form.include_keywords).length, [form.include_keywords]);
  const excludeTermCount = useMemo(() => parseTerms(form.exclude_keywords).length, [form.exclude_keywords]);
  const termLimitExceeded = includeTermCount > 25 || excludeTermCount > 25;
  const accountSelectionInvalid = form.scope_mode === 'selected' && form.account_ids.length === 0;
  const exampleAccountName = useMemo(() => {
    const selectedAccount = accounts.find((account) => form.account_ids.includes(account.id));
    return selectedAccount?.name || accounts[0]?.name || 'Muster GmbH';
  }, [accounts, form.account_ids]);

  const load = async ({ clearNotice = true }: { clearNotice?: boolean } = {}) => {
    setLoading(true);
    if (clearNotice) setNotice(null);
    try {
      const { res, data } = await apiClient.get<any>('/api/account-radar/triggers');
      if (!res.ok) throw new Error(data?.message || 'Sales-Trigger konnten nicht geladen werden.');
      setProfiles(Array.isArray(data?.profiles) ? data.profiles : []);
      setTemplates(Array.isArray(data?.templates) ? data.templates : []);
      setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || 'Sales-Trigger konnten nicht geladen werden.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      handledTargetRef.current = '';
      load();
    } else {
      setEditorOpen(false);
      setFocusedKeyword(null);
    }
  }, [open]);

  const openEditor = (profile?: TriggerProfile, keyword?: string | null) => {
    setPreview(null);
    setNotice(null);
    setFocusedKeyword(keyword || null);
    setForm(profile ? {
      id: profile.id,
      template_key: profile.template_key,
      name: profile.name,
      description: profile.description || '',
      is_active: profile.is_active,
      include_keywords: termsToText(profile.include_keywords),
      exclude_keywords: termsToText(profile.exclude_keywords),
      scope_mode: profile.scope_mode || (profile.account_ids?.length ? 'selected' : 'all'),
      account_ids: profile.account_ids || [],
      include_competitors: profile.include_competitors,
      lookback_days: profile.lookback_days,
      min_content_relevance: profile.min_content_relevance,
    } : { ...emptyForm, account_ids: [] });
    setEditorOpen(true);
  };

  useEffect(() => {
    if (!open || loading || !initialProfileId || !profiles.length) return;
    const targetKey = `${initialProfileId}:${initialKeyword || ''}`;
    if (handledTargetRef.current === targetKey) return;
    handledTargetRef.current = targetKey;
    const profile = profiles.find((item) => item.id === initialProfileId);
    if (profile) openEditor(profile, initialKeyword);
    else setNotice({ severity: 'info', text: 'Der zugehörige Sales-Trigger ist nicht mehr vorhanden.' });
  }, [initialKeyword, initialProfileId, loading, open, profiles]);

  const payload = () => ({
    profile_id: form.id,
    name: form.name,
    description: form.description,
    is_active: form.is_active,
    include_keywords: form.include_keywords,
    exclude_keywords: form.exclude_keywords,
    scope_mode: form.scope_mode,
    account_ids: form.scope_mode === 'selected' ? form.account_ids : [],
    include_competitors: form.scope_mode === 'unassigned' ? false : form.include_competitors,
    lookback_days: form.lookback_days,
    min_content_relevance: form.min_content_relevance,
  });

  const previewArchive = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const { res, data } = await apiClient.post<any>('/api/account-radar/triggers/preview', payload());
      if (!res.ok) throw new Error(data?.message || 'Archivvorschau fehlgeschlagen.');
      setPreview(data as TriggerPreview);
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || 'Archivvorschau fehlgeschlagen.' });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const response = form.id
        ? await apiClient.put<any>(`/api/account-radar/triggers/${form.id}`, payload())
        : await apiClient.post<any>('/api/account-radar/triggers', payload());
      if (!response.res.ok) throw new Error(response.data?.message || 'Sales-Trigger konnte nicht gespeichert werden.');
      setEditorOpen(false);
      setNotice({ severity: 'success', text: 'Sales-Trigger gespeichert.' });
      await load({ clearNotice: false });
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || 'Sales-Trigger konnte nicht gespeichert werden.' });
    } finally {
      setBusy(false);
    }
  };

  const run = async (profile: TriggerProfile) => {
    setBusy(true);
    setNotice({ severity: 'info', text: `„${profile.name}“ wird jetzt im CONTENT-Archiv geprüft …` });
    try {
      const { res, data } = await apiClient.post<any>(`/api/account-radar/triggers/${profile.id}/run`, {});
      if (!res.ok) throw new Error(data?.message || 'Treffer konnten nicht übernommen werden.');
      setNotice({ severity: 'success', text: data?.message || 'CONTENT-Treffer wurden geprüft.' });
      if (Number(data?.inserted || 0) > 0) onImported();
      await load({ clearNotice: false });
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || 'Treffer konnten nicht übernommen werden.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (profile: TriggerProfile) => {
    if (!window.confirm(profile.template_key
      ? `„${profile.name}“ auf die feste Vorlage zurücksetzen und deaktivieren?`
      : `„${profile.name}“ wirklich löschen?`)) return;
    setBusy(true);
    try {
      const { res, data } = await apiClient.delete<any>(`/api/account-radar/triggers/${profile.id}`);
      if (!res.ok) throw new Error(data?.message || 'Sales-Trigger konnte nicht entfernt werden.');
      setNotice({ severity: 'success', text: profile.template_key ? 'Feste Kategorie zurückgesetzt.' : 'Sales-Trigger gelöscht.' });
      await load({ clearNotice: false });
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || 'Sales-Trigger konnte nicht entfernt werden.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 900 }}>Sales-Trigger</DialogTitle>
        <DialogContent>
          <Alert severity="info" icon={<AutoAwesomeOutlinedIcon />} sx={{ mb: 2 }}>
            Vorhandene CONTENT-Artikel werden wahlweise als allgemeine Markt-/Ereignistreffer erkannt oder mit Accounts verknüpft. Die Prüfung ist regelbasiert und verbraucht keine zusätzlichen KI-Tokens.
          </Alert>
          {notice && <Alert severity={notice.severity} sx={{ mb: 2 }}>{notice.text}</Alert>}
          {!premium ? (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, textAlign: 'center' }}>
              <Typography variant="h6" fontWeight={900}>In Sales Premium enthalten</Typography>
              <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                {templates.length || 7} feste Sales-Trigger wie Personalwechsel, Investitionen oder Ladeinfrastruktur mit eigenen Trigger- und Ausschlussbegriffen kombinieren.
              </Typography>
              <Button href="/account-radar?request=upgrade#pakete" variant="contained" sx={{ whiteSpace: 'nowrap' }}>Premium ansehen</Button>
            </Paper>
          ) : (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Box>
                  <Typography fontWeight={900}>{activeCount} aktive Sales-Trigger · {profiles.length} gesamt</Typography>
                  <Typography variant="body2" color="text.secondary">Jeder Sales-Trigger gilt wahlweise als allgemeines Markt-/Ereignissignal, für alle angelegten Accounts oder nur für eine definierte Auswahl.</Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => openEditor()} sx={{ whiteSpace: 'nowrap' }}>Sales-Trigger anlegen</Button>
              </Stack>
              {loading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}
              {!loading && profiles.map((profile) => (
                <Paper key={profile.id} variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: profile.is_active ? 'primary.main' : 'divider' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography fontWeight={900}>{profile.name}</Typography>
                        <Chip size="small" color={profile.is_active ? 'success' : 'default'} label={profile.is_active ? 'Automatik aktiv' : 'Automatik inaktiv'} />
                        {profile.template_key && <Chip size="small" variant="outlined" label="Feste Kategorie" />}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{profile.description}</Typography>
                      <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                        <Chip size="small" label={`${profile.include_keywords.length} Trigger-Begriffe`} />
                        <Chip
                          size="small"
                          color={profile.scope_mode === 'unassigned' ? 'info' : 'default'}
                          label={profile.scope_mode === 'unassigned'
                            ? 'Ohne Account · Markt/Ereignis'
                            : profile.scope_mode === 'selected'
                              ? `${profile.account_ids.length} ausgewählte Accounts`
                              : 'Alle angelegten Accounts'}
                        />
                        {profile.include_competitors && <Chip size="small" color="secondary" variant="outlined" label="inkl. Wettbewerb" />}
                        <Chip size="small" variant="outlined" label={`${profile.match_count || 0} Treffer · ${dateLabel(profile.last_match_at)}`} />
                      </Stack>
                      {profile.scope_mode === 'unassigned' && Boolean(profile.recent_market_matches?.length) && (
                        <Stack spacing={0.35} sx={{ mt: 1 }}>
                          {profile.recent_market_matches!.slice(0, 3).map((match, index) => (
                            <Link
                              key={`${match.original_url}-${index}`}
                              href={match.original_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              underline="hover"
                              variant="caption"
                              sx={{ display: 'block', fontWeight: 750 }}
                            >
                              {match.title} · Trigger-Begriff: {match.matched_keywords.join(', ')}
                            </Link>
                          ))}
                        </Stack>
                      )}
                    </Box>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                      <Tooltip title={profile.is_active ? 'Jetzt einmalig prüfen und Treffer übernehmen' : 'Jetzt einmalig prüfen – die Automatik bleibt inaktiv'}><span><Button size="small" variant="contained" disabled={busy} onClick={() => run(profile)} startIcon={<PlayArrowOutlinedIcon />} sx={{ whiteSpace: 'nowrap' }}>Jetzt prüfen</Button></span></Tooltip>
                      <Tooltip title="Bearbeiten"><IconButton disabled={busy} onClick={() => openEditor(profile)}><EditOutlinedIcon /></IconButton></Tooltip>
                      <Tooltip title={profile.template_key ? 'Zurücksetzen' : 'Löschen'}><IconButton disabled={busy} onClick={() => remove(profile)} color="error"><DeleteOutlineIcon /></IconButton></Tooltip>
                    </Stack>
                  </Stack>
                </Paper>
              ))}
              {!loading && !profiles.length && <Alert severity="warning">Noch keine Sales-Trigger vorhanden.</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions><Button onClick={onClose} disabled={busy}>Schließen</Button></DialogActions>
      </Dialog>

      <Dialog open={editorOpen} onClose={busy ? undefined : () => setEditorOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 900 }}>{form.id ? 'Sales-Trigger bearbeiten' : 'Sales-Trigger anlegen'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {focusedKeyword && (
              <Alert severity="info">
                Direkt aus dem Treffer geöffnet · auslösender Trigger-Begriff: <strong>{focusedKeyword}</strong>
              </Alert>
            )}
            {form.template_key && (
              <Alert severity="info">Die Basisbegriffe dieser festen Kategorie bleiben erhalten. Eigene Begriffe können ergänzt werden.</Alert>
            )}
            <TextField fullWidth label="Name" value={form.name} disabled={Boolean(form.template_key)} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <TextField fullWidth label="Beschreibung" value={form.description} multiline minRows={2} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField fullWidth label="Trigger-Begriffe" error={includeTermCount > 25} helperText={`Ein Begriff pro Zeile oder durch Komma getrennt · ${includeTermCount} von 25`} value={form.include_keywords} multiline minRows={5} onChange={(event) => setForm((current) => ({ ...current, include_keywords: event.target.value }))} />
              <TextField fullWidth label="Ausschlussbegriffe" error={excludeTermCount > 25} helperText={`Verhindert unpassende Treffer · ${excludeTermCount} von 25`} value={form.exclude_keywords} multiline minRows={5} onChange={(event) => setForm((current) => ({ ...current, exclude_keywords: event.target.value }))} />
            </Stack>
            <Alert severity="success">
              {form.scope_mode === 'unassigned' ? (
                <><strong>Beispiel ohne Account:</strong> Der Trigger-Begriff „verstärkt“ findet „BYD verstärkt Führung in Deutschland“ direkt als Trigger-Treffer. Ein angelegter BYD-Account ist dafür nicht erforderlich.</>
              ) : (
                <><strong>Beispiel mit Account:</strong> Ist der Account „{exampleAccountName}“ angelegt, findet der Trigger-Begriff „investiert“ einen Artikel wie „{exampleAccountName} investiert in neue Ladeinfrastruktur“. Trigger-Begriff und Accountname müssen im Inhalt vorkommen.</>
              )}
            </Alert>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
              <Typography fontWeight={850} sx={{ mb: 1 }}>Gültigkeitsbereich</Typography>
              <RadioGroup
                value={form.scope_mode}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  scope_mode: event.target.value as TriggerScopeMode,
                  account_ids: event.target.value === 'selected' ? current.account_ids : [],
                  include_competitors: event.target.value === 'unassigned' ? false : current.include_competitors,
                }))}
              >
                {([
                  ['unassigned', 'Ohne Account – Thema/Ereignis', 'Findet Trigger-Begriffe unabhängig von angelegten Accounts. Diese Trigger-Treffer bleiben getrennt von Accountbestand und Pipeline.'],
                  ['all', 'Alle angelegten Accounts', 'Ordnet Treffer automatisch allen passenden aktiven Radar-Accounts zu – auch künftig neu angelegten.'],
                  ['selected', 'Ausgewählte Accounts', 'Begrenzt die Zuordnung auf die unten ausdrücklich markierten Accounts.'],
                ] as Array<[TriggerScopeMode, string, string]>).map(([value, label, description]) => (
                  <Paper
                    key={value}
                    variant="outlined"
                    sx={{
                      mb: 1,
                      px: 1,
                      py: 0.6,
                      borderRadius: 2,
                      borderColor: form.scope_mode === value ? 'primary.main' : 'divider',
                      bgcolor: form.scope_mode === value ? 'action.selected' : 'transparent',
                    }}
                  >
                    <FormControlLabel
                      value={value}
                      control={<Radio />}
                      sx={{ m: 0, alignItems: 'flex-start', width: '100%' }}
                      label={(
                        <Box sx={{ pt: 0.7 }}>
                          <Typography fontWeight={850}>{label}</Typography>
                          <Typography variant="caption" color="text.secondary">{description}</Typography>
                        </Box>
                      )}
                    />
                  </Paper>
                ))}
              </RadioGroup>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2" fontWeight={800} color={form.scope_mode === 'selected' ? 'text.primary' : 'text.disabled'}>Accounts einzeln auswählen</Typography>
              <Box sx={{ mt: 0.5, maxHeight: 180, overflowY: 'auto', opacity: form.scope_mode === 'selected' ? 1 : 0.45 }}>
                {accounts.map((account) => (
                  <FormControlLabel
                    key={account.id}
                    disabled={form.scope_mode !== 'selected'}
                    sx={{ display: 'flex', mx: 0 }}
                    control={<Checkbox checked={form.account_ids.includes(account.id)} onChange={(event) => setForm((current) => ({
                      ...current,
                      account_ids: event.target.checked ? [...current.account_ids, account.id] : current.account_ids.filter((id) => id !== account.id),
                    }))} />}
                    label={`${account.name}${account.competitor_count ? ` · ${account.competitor_count} Wettbewerber` : ''}`}
                  />
                ))}
                {!accounts.length && <Typography variant="body2" color="text.secondary">Noch keine aktiven Accounts vorhanden.</Typography>}
              </Box>
              {accountSelectionInvalid && <Alert severity="warning" sx={{ mt: 1 }}>Bitte für diesen Gültigkeitsbereich mindestens einen Account auswählen.</Alert>}
            </Paper>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField select fullWidth label="Zeitraum" value={form.lookback_days} onChange={(event) => setForm((current) => ({ ...current, lookback_days: Number(event.target.value) }))}>
                {[7, 30, 90, 365].map((days) => <MenuItem key={days} value={days}>{days === 365 ? '12 Monate' : `${days} Tage`}</MenuItem>)}
              </TextField>
              <TextField select fullWidth label="CONTENT-Mindest-Relevanz" value={form.min_content_relevance} onChange={(event) => setForm((current) => ({ ...current, min_content_relevance: Number(event.target.value) }))}>
                {[0, 25, 50, 75].map((value) => <MenuItem key={value} value={value}>{value ? `ab ${value}` : 'Alle'}</MenuItem>)}
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControlLabel control={<Switch checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />} label="Automatische Prüfung aktiv" />
              <FormControlLabel disabled={form.scope_mode === 'unassigned'} control={<Switch checked={form.include_competitors} onChange={(event) => setForm((current) => ({ ...current, include_competitors: event.target.checked }))} />} label={form.scope_mode === 'unassigned' ? 'Wettbewerber nur bei Account-Zuordnung' : 'Wettbewerber einbeziehen'} />
            </Stack>
            <Button startIcon={<SearchOutlinedIcon />} variant="outlined" onClick={previewArchive} disabled={busy || termLimitExceeded || accountSelectionInvalid || !form.name.trim() || !form.include_keywords.trim()} sx={{ alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
              Archivvorschau prüfen
            </Button>
            <Typography variant="caption" color="text.secondary">
              Die Archivvorschau verändert noch keine Radar-Daten. Sales-Trigger speichern und anschließend „Jetzt prüfen“ wählen, um passende Signale zu übernehmen.
            </Typography>
            {preview && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Typography fontWeight={900}>{preview.matches.length} {preview.scopeMode === 'unassigned' ? 'passende Markt-/Ereignistreffer' : 'passende Account-Treffer'}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {preview.scanned} Inhalte geprüft · {preview.scopeMode === 'unassigned' ? 'keine Account-Zuordnung erforderlich' : `${preview.accountCount} Accounts · ${preview.keywordMatchesWithoutAccount} Begriffstreffer ohne eindeutige Account-Zuordnung`}
                </Typography>
                {preview.keywordMatchesWithoutAccount > 0 && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>
                    <Typography variant="body2" fontWeight={850}>Trigger-Begriff gefunden, aber kein angelegter Account passt.</Typography>
                    <Typography variant="body2" sx={{ mb: preview.unassignedKeywordMatches?.length ? 1 : 0 }}>
                      „Für alle Accounts“ durchsucht nur die im Account-Radar angelegten Accounts. Legen Sie die genannte Organisation zuerst als Account an und prüfen Sie den Trigger danach erneut.
                    </Typography>
                    <Stack spacing={0.7}>
                      {(preview.unassignedKeywordMatches || []).map((item, index) => (
                        <Box key={`${item.original_url}-${index}`}>
                          <Link href={item.original_url} target="_blank" rel="noopener noreferrer" underline="hover" fontWeight={750}>{item.title}</Link>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Trigger-Begriff gefunden: {item.matched_keywords.join(', ')} · keine Account-Zuordnung
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Alert>
                )}
                <Stack spacing={1} sx={{ mt: 1.5, maxHeight: 240, overflowY: 'auto' }}>
                  {preview.matches.slice(0, 12).map((match, index) => (
                    <Box key={`${match.account_id}-${match.original_url}-${index}`}>
                      <Typography variant="body2" fontWeight={800}>{match.account_name || 'Markt-/Ereignistreffer'}{match.competitor_name ? ` · Wettbewerb: ${match.competitor_name}` : ''}</Typography>
                      <Typography variant="body2">{match.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{match.match_score}% · Trigger-Begriff gefunden: {match.matched_keywords.join(', ')}</Typography>
                    </Box>
                  ))}
                  {!preview.matches.length && <Alert severity="info">{preview.scopeMode === 'unassigned' ? 'Im gewählten Zeitraum wurde kein passender Trigger-Begriff gefunden.' : 'Im gewählten Zeitraum gibt es noch keinen eindeutig einem Account zuordenbaren Treffer.'}</Alert>}
                </Stack>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ gap: 0.5, flexWrap: 'wrap', '& .MuiButton-root': { whiteSpace: 'nowrap' } }}>
          <Button onClick={() => setEditorOpen(false)} disabled={busy}>Abbrechen</Button>
          <Button variant="contained" onClick={save} disabled={busy || termLimitExceeded || accountSelectionInvalid || !form.name.trim() || !form.include_keywords.trim()}>{busy ? 'Speichert …' : 'Speichern'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AccountRadarTriggerDialog;
