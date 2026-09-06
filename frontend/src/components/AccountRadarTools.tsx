import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import apiClient from '../apiClient';
import AccountRadarIntegrationDialog from './AccountRadarIntegrationDialog';

interface StaffRecipient {
  id: string;
  email: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  role: string;
  selected: boolean;
}

interface RadarSettings {
  digest_frequency: 'off' | 'daily' | 'weekdays' | 'weekly';
  delivery_hour: number;
  weekly_day: number;
  min_relevance: number;
}

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
  contacts_created?: number;
  contacts_updated?: number;
  contacts_skipped?: number;
  errors?: Array<{ row: number; message: string }>;
}

type DataExchangeType = 'accounts' | 'tasks';

interface RadarDelivery {
  status: 'sending' | 'sent' | 'skipped' | 'failed';
  signal_count: number | null;
  recipient_email: string;
  created_at: string;
  sent_at: string | null;
  error_message: string | null;
}

interface AccountRadarToolsProps {
  onImported: () => void;
  onManageAccounts?: () => void;
  onOpenCampaigns?: () => void;
  onOpenCalendarFeed?: () => void;
  accountCount?: number;
  openPanel?: 'import' | 'settings' | null;
  onPanelOpened?: () => void;
  entitlements?: SalesEntitlements | null;
}

export interface SalesEntitlements {
  key: 'basic' | 'premium';
  label: string;
  limits: {
    accounts: number;
    digestRecipients: number;
    importRows: number;
    apiTokens: number;
  };
  features: {
    dataImport: boolean;
    frequentDigest: boolean;
    competitorMonitoring: boolean;
    aiSalesContext: boolean;
    managementPdf: boolean;
    advancedAnalytics: boolean;
    dataQuality: boolean;
    apiIntegration: boolean;
  };
  usage?: { accounts: number };
  subscription?: {
    status: 'active' | 'trial' | 'paused';
    label: string;
    trialEndsOn?: string | null;
    trialDaysRemaining?: number | null;
    trialExpired: boolean;
    accessActive: boolean;
    monthlyPriceEur?: number | null;
    billingCycle?: 'monthly' | 'annual';
  };
}

const defaultSettings: RadarSettings = {
  digest_frequency: 'off',
  delivery_hour: 8,
  weekly_day: 1,
  min_relevance: 70,
};

const getRecipientLabel = (recipient: StaffRecipient) => {
  const name = [recipient.first_name, recipient.last_name].filter(Boolean).join(' ').trim();
  return name || recipient.username || recipient.email;
};

const deliveryStatus: Record<RadarDelivery['status'], { label: string; color: 'success' | 'error' | 'warning' | 'info' }> = {
  sent: { label: 'Gesendet', color: 'success' },
  failed: { label: 'Fehlgeschlagen', color: 'error' },
  skipped: { label: 'Keine Signale', color: 'warning' },
  sending: { label: 'Wird gesendet', color: 'info' },
};

const formatDeliveryDate = (value: string | null) => {
  if (!value) return '–';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  return new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const AccountRadarTools: React.FC<AccountRadarToolsProps> = ({
  onImported,
  onManageAccounts,
  onOpenCampaigns,
  onOpenCalendarFeed,
  accountCount,
  openPanel = null,
  onPanelOpened,
  entitlements: entitlementProp = null,
}) => {
  const hasNoAccounts = accountCount === 0;
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exchangeType, setExchangeType] = useState<DataExchangeType>('accounts');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<DataExchangeType | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [settings, setSettings] = useState<RadarSettings>(defaultSettings);
  const [staff, setStaff] = useState<StaffRecipient[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<RadarDelivery[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [settingsNoticeSeverity, setSettingsNoticeSeverity] = useState<'success' | 'error' | 'info'>('info');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewCampaignCount, setPreviewCampaignCount] = useState<number | null>(null);
  const [entitlements, setEntitlements] = useState<SalesEntitlements | null>(entitlementProp);
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [toolsAnchor, setToolsAnchor] = useState<HTMLElement | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    if (!openPanel) return;
    if (openPanel === 'import' && !entitlements) return;
    if (openPanel === 'import' && entitlements?.features.dataImport) setImportOpen(true);
    if (openPanel === 'import' && entitlements && !entitlements.features.dataImport) {
      setSettingsNoticeSeverity('info');
      setSettingsNotice('CSV-/Excel-Import ist in Sales Premium enthalten.');
      setSettingsOpen(true);
    }
    if (openPanel === 'settings') setSettingsOpen(true);
    onPanelOpened?.();
  }, [entitlements, openPanel, onPanelOpened]);

  useEffect(() => setEntitlements(entitlementProp), [entitlementProp]);

  const loadSettings = async () => {
    setSettingsLoading(true);
    setSettingsNotice(null);
    try {
      const { res, data } = await apiClient.get<any>('/api/account-radar/settings');
      if (!res.ok) throw new Error(data?.message || 'Einstellungen konnten nicht geladen werden.');
      setSettings({ ...defaultSettings, ...(data?.settings || {}) });
      if (data?.entitlements) setEntitlements(data.entitlements);
      const nextStaff = Array.isArray(data?.staff) ? data.staff : [];
      setStaff(nextStaff);
      setRecentDeliveries(Array.isArray(data?.recentDeliveries) ? data.recentDeliveries : []);
      const storedIds = nextStaff.filter((recipient: StaffRecipient) => recipient.selected).map((recipient: StaffRecipient) => recipient.id);
      const recipientLimit = Number(data?.entitlements?.limits?.digestRecipients || 3);
      setSelectedIds((storedIds.length ? storedIds : nextStaff.length === 1 ? [nextStaff[0].id] : []).slice(0, recipientLimit));
    } catch (error: any) {
      setSettingsNoticeSeverity('error');
      setSettingsNotice(error?.message || 'Einstellungen konnten nicht geladen werden.');
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    if (settingsOpen) loadSettings();
  }, [settingsOpen]);

  const downloadTemplate = () => {
    const accountContent = '\uFEFFAccount-ID;Externe Account-ID;Name;Website;LinkedIn;Logo-URL;Status;Notizen;Aktiv;Adresse;Zentrale E-Mail;Zentrales Telefon;Ansprechpartner-ID;Externe Kontakt-ID;Ansprechpartner;Funktion;Kontakt-E-Mail;Kontakt-Telefon;Kontakt-LinkedIn;Kontakt-Notizen;Primärkontakt\r\n;crm-account-4711;Beispiel GmbH;https://example.com;https://www.linkedin.com/company/example;;Interessent;Priorität A;Ja;Musterstraße 1, 1010 Wien;office@example.com;+43 1 123456;;crm-contact-815;Erika Muster;Fuhrparkleitung;erika@example.com;+43 1 123456-10;;;Ja\r\n';
    const taskContent = '\uFEFFAufgabe-ID;Externe Aufgabe-ID;Signal-ID;Aufgabenstatus;Vertriebsphase;Priorität;Opportunity-Wert EUR;Abschlusswahrscheinlichkeit %;Aktion;Termin;Verantwortlich-ID;Verantwortlich-E-Mail;Ansprechpartner-ID;Externe Kontakt-ID;Ansprechpartner;Kontaktkanal;Notiz\r\n';
    const content = exchangeType === 'accounts' ? accountContent : taskContent;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = exchangeType === 'accounts'
      ? 'account-radar-accounts-kontakte-vorlage.csv'
      : 'account-radar-aufgaben-ergebnisse-vorlage.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (exchangeType === 'accounts') formData.append('overwrite', String(overwrite));
      const endpoint = exchangeType === 'accounts'
        ? '/api/account-radar/accounts/import'
        : '/api/account-radar/tasks/import';
      const { res, data } = await apiClient.post<any>(endpoint, formData);
      if (!res.ok) throw new Error(data?.message || 'Import fehlgeschlagen.');
      setImportResult(data as ImportResult);
      onImported();
    } catch (error: any) {
      setImportError(error?.message || 'Import fehlgeschlagen.');
    } finally {
      setImporting(false);
    }
  };

  const downloadExport = async (type: DataExchangeType) => {
    setExporting(type);
    setExportError(null);
    try {
      const response = await fetch(`/api/account-radar/exports/${type}.csv`, { credentials: 'include' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || 'Export fehlgeschlagen.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1]
        || `account-radar-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setExportError(error?.message || 'Export fehlgeschlagen.');
    } finally {
      setExporting(null);
    }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsNotice(null);
    try {
      const { res, data } = await apiClient.put<any>('/api/account-radar/settings', {
        ...settings,
        recipient_ids: selectedIds,
      });
      if (!res.ok) throw new Error(data?.message || 'Einstellungen konnten nicht gespeichert werden.');
      setSettingsNoticeSeverity('success');
      setSettingsNotice(data?.message || 'Einstellungen gespeichert.');
    } catch (error: any) {
      setSettingsNoticeSeverity('error');
      setSettingsNotice(error?.message || 'Einstellungen konnten nicht gespeichert werden.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const loadPreview = async () => {
    setSettingsNotice(null);
    try {
      const { res, data } = await apiClient.get<any>('/api/account-radar/digest/preview', {
        params: { minRelevance: settings.min_relevance },
      });
      if (!res.ok) throw new Error(data?.message || 'Vorschau konnte nicht geladen werden.');
      setPreviewCount(Number(data?.signalCount || 0));
      setPreviewCampaignCount(Number(data?.campaignCount || 0));
      setSettingsNoticeSeverity('info');
    } catch (error: any) {
      setSettingsNoticeSeverity('error');
      setSettingsNotice(error?.message || 'Vorschau konnte nicht geladen werden.');
    }
  };

  const sendTestMail = async () => {
    setTestSending(true);
    setSettingsNotice(null);
    try {
      const { res, data } = await apiClient.post<any>('/api/account-radar/digest/test', {
        min_relevance: settings.min_relevance,
      });
      if (!res.ok) throw new Error(data?.message || 'Testmail konnte nicht gesendet werden.');
      setPreviewCount(Number(data?.signalCount || 0));
      setPreviewCampaignCount(Number(data?.campaignCount || 0));
      setSettingsNoticeSeverity('success');
      setSettingsNotice(data?.message || 'Testmail wurde an Ihre Konto-Adresse gesendet.');
    } catch (error: any) {
      setSettingsNoticeSeverity('error');
      setSettingsNotice(error?.message || 'Testmail konnte nicht gesendet werden.');
    } finally {
      setTestSending(false);
    }
  };

  return (
    <>
      <Tooltip title={hasNoAccounts ? 'Einstellungen öffnen – zuerst einen Account anlegen' : 'Radar-Werkzeuge und Einstellungen'}>
        <IconButton
          onClick={(event) => setToolsAnchor(event.currentTarget)}
          aria-label="Radar-Werkzeuge öffnen"
          aria-controls={toolsAnchor ? 'account-radar-tools-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={toolsAnchor ? 'true' : undefined}
          sx={{ width: 42, height: 42, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
        >
          <Badge color="error" badgeContent={hasNoAccounts ? '!' : 0} overlap="circular">
            <SettingsOutlinedIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        id="account-radar-tools-menu"
        anchorEl={toolsAnchor}
        open={Boolean(toolsAnchor)}
        onClose={() => setToolsAnchor(null)}
        slotProps={{ paper: { sx: { mt: 0.7, minWidth: 260, borderRadius: 2.5 } } }}
      >
        {onManageAccounts && (
          <MenuItem onClick={() => { setToolsAnchor(null); onManageAccounts(); }}>
            <ListItemIcon>
              <Badge color="error" badgeContent={hasNoAccounts ? '!' : 0} overlap="circular">
                <BusinessCenterOutlinedIcon fontSize="small" />
              </Badge>
            </ListItemIcon>
            <ListItemText primary="Accounts verwalten" secondary={hasNoAccounts ? 'Zuerst einen Account anlegen' : accountCount === undefined ? 'Account-Bestand wird geladen' : `${accountCount} Accounts eingerichtet`} />
          </MenuItem>
        )}
        {onOpenCampaigns && (
          <MenuItem onClick={() => { setToolsAnchor(null); onOpenCampaigns(); }} disabled={hasNoAccounts}>
            <ListItemIcon><CampaignOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Kampagnen organisieren" secondary={hasNoAccounts ? 'Benötigt mindestens einen Account' : 'Accounts und Signale bündeln'} />
          </MenuItem>
        )}
        {onOpenCalendarFeed && (
          <MenuItem onClick={() => { setToolsAnchor(null); onOpenCalendarFeed(); }}>
            <ListItemIcon><CalendarMonthOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Kalenderfeed" secondary={hasNoAccounts ? 'Feed verwalten; derzeit keine Accounts' : 'Externen Kalender verbinden'} />
          </MenuItem>
        )}
        {(onManageAccounts || onOpenCampaigns || onOpenCalendarFeed) && <Divider />}
        {entitlements?.features.dataImport && (
          <MenuItem onClick={() => { setToolsAnchor(null); setImportOpen(true); }}>
            <ListItemIcon><UploadFileIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Daten importieren" secondary="CSV oder Excel" />
          </MenuItem>
        )}
        <MenuItem onClick={() => { setToolsAnchor(null); setExportOpen(true); }}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Daten exportieren" secondary="Accounts oder Aufgaben" />
        </MenuItem>
        <MenuItem onClick={() => { setToolsAnchor(null); setSettingsOpen(true); }}>
          <ListItemIcon><NotificationsActiveIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Daily-Radar" secondary="Versand und Empfänger" />
        </MenuItem>
        {entitlements?.features.dataQuality && (
          <MenuItem onClick={() => { setToolsAnchor(null); setIntegrationOpen(true); }}>
            <ListItemIcon><HubOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Daten & API" secondary="Qualität und Integrationen" />
          </MenuItem>
        )}
      </Menu>

      {entitlements && (
        <AccountRadarIntegrationDialog
          open={integrationOpen}
          onClose={() => setIntegrationOpen(false)}
          entitlements={entitlements}
        />
      )}

      <Dialog open={importOpen} onClose={() => !importing && setImportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>CSV-/Excel-Daten importieren</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              select
              fullWidth
              label="Datenbereich"
              value={exchangeType}
              disabled={importing}
              onChange={(event) => {
                setExchangeType(event.target.value as DataExchangeType);
                setFile(null);
                setImportResult(null);
                setImportError(null);
              }}
            >
              <MenuItem value="accounts">Accounts & Ansprechpartner</MenuItem>
              <MenuItem value="tasks">Aufgaben & Ergebnisse</MenuItem>
            </TextField>
            <Alert severity="info">
              {exchangeType === 'accounts'
                ? <>Erforderlich ist <strong>Name</strong>. Mehrere Zeilen desselben Accounts können verschiedene Ansprechpartner enthalten.</>
                : <>Starten Sie sicherheitshalber mit dem aktuellen Aufgaben-Export. Nur bestehende <strong>Signal-IDs</strong> dieses Mandanten werden aktualisiert.</>}
            </Alert>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
            <Button component="label" variant="contained" startIcon={<UploadFileIcon />}>
              Datei auswählen
              <input hidden type="file" accept=".csv,.xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </Button>
            <Button variant="text" startIcon={<DownloadIcon />} onClick={downloadTemplate}>CSV-Vorlage</Button>
          </Stack>
          {file && <Chip sx={{ mt: 1.5 }} label={`${file.name} · ${(file.size / 1024).toFixed(0)} KB`} />}
          {exchangeType === 'accounts' && (
            <>
              <FormControlLabel
                sx={{ mt: 1.5, display: 'flex' }}
                control={<Checkbox checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />}
                label="Vorhandene Accounts und Ansprechpartner aktualisieren"
              />
              {!overwrite && <Typography variant="caption" color="text.secondary">Bestehende Datensätze werden standardmäßig übersprungen.</Typography>}
            </>
          )}
          {importError && <Alert severity="error" sx={{ mt: 2 }}>{importError}</Alert>}
          {importResult && (
            <Alert severity={importResult.invalid ? 'warning' : 'success'} sx={{ mt: 2 }}>
              {importResult.created} angelegt, {importResult.updated} aktualisiert, {importResult.skipped} übersprungen,
              {' '}{importResult.invalid} fehlerhaft.
              {exchangeType === 'accounts' && (
                <Typography variant="caption" display="block">
                  Ansprechpartner: {importResult.contacts_created || 0} angelegt, {importResult.contacts_updated || 0} aktualisiert,
                  {' '}{importResult.contacts_skipped || 0} übersprungen.
                </Typography>
              )}
              {importResult.errors?.slice(0, 5).map((error) => (
                <Typography key={`${error.row}-${error.message}`} variant="caption" display="block">Zeile {error.row}: {error.message}</Typography>
              ))}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5, '& .MuiButton-root': { whiteSpace: 'normal', lineHeight: 1.2 } }}>
          <Button onClick={() => setImportOpen(false)} disabled={importing}>Schließen</Button>
          <Button variant="contained" onClick={runImport} disabled={!file || importing}>{importing ? 'Import läuft …' : 'Importieren'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={exportOpen} onClose={() => !exporting && setExportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Mandantendaten als CSV exportieren</DialogTitle>
        <DialogContent>
          {entitlements && (
            <Alert severity={entitlements.key === 'premium' ? 'success' : 'info'} sx={{ mb: 2 }}>
              <strong>{entitlements.label}</strong>: bis zu {entitlements.limits.digestRecipients} Empfänger
              {entitlements.features.managementPdf ? ', inklusive Management-PDF.' : ', wöchentlicher Versand ohne Management-PDF.'}
            </Alert>
          )}
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Die Dateien enthalten ausschließlich Daten des aktuell angemeldeten Mandanten und können in Excel geöffnet werden.
          </Typography>
          <Stack spacing={1.5}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
              <Typography fontWeight={850}>Accounts & Ansprechpartner</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Stammdaten, Adressen, Logos, Kontakte und Status zur Sicherung oder Pflege exportieren.
              </Typography>
              <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => downloadExport('accounts')} disabled={Boolean(exporting)}>
                {exporting === 'accounts' ? 'Export läuft …' : 'Accounts herunterladen'}
              </Button>
            </Paper>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
              <Typography fontWeight={850}>Aufgaben & Ergebnisse</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Offene und erledigte Radar-Aufgaben inklusive Pipeline-Phase, Termin, Zuständigkeit und Ergebnis exportieren.
              </Typography>
              <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => downloadExport('tasks')} disabled={Boolean(exporting)}>
                {exporting === 'tasks' ? 'Export läuft …' : 'Aufgaben herunterladen'}
              </Button>
            </Paper>
            {exportError && <Alert severity="error">{exportError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)} disabled={Boolean(exporting)}>Schließen</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={settingsOpen} onClose={() => !settingsSaving && setSettingsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Daily-Radar einstellen</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Nur ausgewählte Mandantenmitarbeiter erhalten relevante offene Account-Signale und den aktuellen Kampagnenstand. Bei deaktiviertem Versand werden keine E-Mails erzeugt.
          </Typography>
          <Stack spacing={2}>
            <TextField
              select
              label="Versand"
              value={settings.digest_frequency}
              disabled={settingsLoading}
              onChange={(event) => setSettings((current) => ({ ...current, digest_frequency: event.target.value as RadarSettings['digest_frequency'] }))}
            >
              <MenuItem value="off">Deaktiviert</MenuItem>
              <MenuItem value="daily" disabled={!entitlements?.features.frequentDigest}>Täglich {!entitlements?.features.frequentDigest && '· Premium'}</MenuItem>
              <MenuItem value="weekdays" disabled={!entitlements?.features.frequentDigest}>Montag bis Freitag {!entitlements?.features.frequentDigest && '· Premium'}</MenuItem>
              <MenuItem value="weekly">Wöchentlich</MenuItem>
            </TextField>
            {settings.digest_frequency !== 'off' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField select fullWidth label="Versandzeit" value={settings.delivery_hour} onChange={(event) => setSettings((current) => ({ ...current, delivery_hour: Number(event.target.value) }))}>
                  {Array.from({ length: 18 }, (_, index) => index + 5).map((hour) => <MenuItem key={hour} value={hour}>{String(hour).padStart(2, '0')}:10 Uhr</MenuItem>)}
                </TextField>
                {settings.digest_frequency === 'weekly' && (
                  <TextField select fullWidth label="Wochentag" value={settings.weekly_day} onChange={(event) => setSettings((current) => ({ ...current, weekly_day: Number(event.target.value) }))}>
                    {['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'].map((day, index) => <MenuItem key={day} value={index + 1}>{day}</MenuItem>)}
                  </TextField>
                )}
                <TextField select fullWidth label="Mindest-Relevanz" value={settings.min_relevance} onChange={(event) => { setSettings((current) => ({ ...current, min_relevance: Number(event.target.value) })); setPreviewCount(null); setPreviewCampaignCount(null); }}>
                  {[60, 70, 80, 90].map((value) => <MenuItem key={value} value={value}>ab {value}</MenuItem>)}
                </TextField>
              </Stack>
            )}

            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Typography fontWeight={850}>Empfänger</Typography>
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" onClick={() => setSelectedIds(staff.slice(0, entitlements?.limits.digestRecipients || 3).map((recipient) => recipient.id))}>Alle</Button>
                  <Button size="small" onClick={() => setSelectedIds([])}>Keine</Button>
                </Stack>
              </Stack>
              {staff.map((recipient) => (
                <FormControlLabel
                  key={recipient.id}
                  sx={{ display: 'flex', mx: 0 }}
                  control={<Checkbox
                    checked={selectedSet.has(recipient.id)}
                    disabled={!selectedSet.has(recipient.id) && selectedIds.length >= (entitlements?.limits.digestRecipients || 3)}
                    onChange={(event) => setSelectedIds((current) => event.target.checked
                      ? [...current, recipient.id].slice(0, entitlements?.limits.digestRecipients || 3)
                      : current.filter((id) => id !== recipient.id))}
                  />}
                  label={<Box><Typography variant="body2" fontWeight={750}>{getRecipientLabel(recipient)}</Typography><Typography variant="caption" color="text.secondary">{recipient.email} · {recipient.role}</Typography></Box>}
                />
              ))}
              {!staff.length && <Alert severity="warning">Keine aktive Admin-/Assistenz-Adresse für diesen Mandanten gefunden.</Alert>}
              {!!staff.length && <Typography variant="caption" color="text.secondary">Auswahl: {selectedIds.length} / {entitlements?.limits.digestRecipients || 3}</Typography>}
            </Paper>

            <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                justifyContent="space-between"
                alignItems={{ xs: 'stretch', sm: 'center' }}
                sx={{ p: 1.5 }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <HistoryIcon color="action" fontSize="small" />
                    <Typography fontWeight={850}>Automatische Versandhistorie</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {recentDeliveries.length
                      ? `Letzter Lauf: ${formatDeliveryDate(recentDeliveries[0].sent_at || recentDeliveries[0].created_at)}`
                      : 'Noch kein automatischer Versand protokolliert.'}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  {recentDeliveries[0] && (
                    <Chip
                      size="small"
                      label={deliveryStatus[recentDeliveries[0].status]?.label || recentDeliveries[0].status}
                      color={deliveryStatus[recentDeliveries[0].status]?.color || 'info'}
                    />
                  )}
                  <Button
                    size="small"
                    endIcon={<ExpandMoreIcon sx={{ transform: historyOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
                    onClick={() => setHistoryOpen((open) => !open)}
                    disabled={!recentDeliveries.length}
                    aria-expanded={historyOpen}
                  >
                    Verlauf ({recentDeliveries.length})
                  </Button>
                </Stack>
              </Stack>
              <Collapse in={historyOpen} unmountOnExit>
                <Divider />
                <Stack divider={<Divider flexItem />}>
                  {recentDeliveries.map((delivery, index) => {
                    const status = deliveryStatus[delivery.status] || { label: delivery.status, color: 'info' as const };
                    return (
                      <Box key={`${delivery.recipient_email}-${delivery.created_at}-${index}`} sx={{ p: 1.5 }}>
                        <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={750} sx={{ overflowWrap: 'anywhere' }}>
                              {delivery.recipient_email}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatDeliveryDate(delivery.sent_at || delivery.created_at)} · {Number(delivery.signal_count || 0)} Signale
                            </Typography>
                          </Box>
                          <Chip size="small" label={status.label} color={status.color} />
                        </Stack>
                        {delivery.error_message && (
                          <Alert severity="error" sx={{ mt: 1, py: 0 }}>
                            {delivery.error_message}
                          </Alert>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              </Collapse>
            </Paper>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button variant="text" onClick={loadPreview}>Aktuelle Vorschau prüfen</Button>
              <Button
                variant="outlined"
                startIcon={<EmailOutlinedIcon />}
                onClick={sendTestMail}
                disabled={settingsLoading || testSending}
              >
                {testSending ? 'Sendet …' : 'Testmail an mich'}
              </Button>
              {previewCount !== null && <Chip color={previewCount ? 'success' : 'default'} label={`${previewCount} passende offene Signale`} />}
              {previewCampaignCount !== null && <Chip color={previewCampaignCount ? 'primary' : 'default'} label={`${previewCampaignCount} Kampagnen im Bericht`} />}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Die Testmail geht nur an die E-Mail-Adresse Ihres aktuell angemeldeten Kontos. Sie ändert weder Empfänger noch Versandplan.
            </Typography>
            {settingsNotice && <Alert severity={settingsNoticeSeverity}>{settingsNotice}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5, '& .MuiButton-root': { whiteSpace: 'normal', lineHeight: 1.2 } }}>
          <Button onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>Schließen</Button>
          <Button variant="contained" onClick={saveSettings} disabled={settingsLoading || settingsSaving}>{settingsSaving ? 'Speichert …' : 'Speichern'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AccountRadarTools;
