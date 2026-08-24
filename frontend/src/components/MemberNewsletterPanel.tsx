import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox,
  Chip, CircularProgress, Divider, FormControlLabel, Grid, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PreviewOutlinedIcon from '@mui/icons-material/PreviewOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import apiClient from '../apiClient';
import { useSnackbar } from '../context/SnackbarContext';

interface Props {
  businessPartnerId: string;
  partnerName?: string;
  ownEmail?: string;
}

interface Preview {
  eligible_count: number;
  members_total: number;
  configured_mode: 'mobiliti' | 'export' | 'external';
  effective_mode: 'mobiliti' | 'export' | 'external';
  direct_limit: number;
  excluded: { inactive: number; expired: number; without_consent: number };
  membership_levels: string[];
  recipients: Array<{ id: string; name: string; email: string; membership_level?: string; active_until?: string }>;
  signature: { name: string; organization?: string; address?: string; email?: string; url?: string };
}

const MemberNewsletterPanel: React.FC<Props> = ({ businessPartnerId, partnerName, ownEmail }) => {
  const { showSnackbar } = useSnackbar();
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [membershipLevel, setMembershipLevel] = useState('');
  const [expiresWithinDays, setExpiresWithinDays] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(new Set());

  const params = useMemo(() => {
    const query = new URLSearchParams({ bpId: businessPartnerId });
    if (membershipLevel.trim()) query.set('membershipLevel', membershipLevel.trim());
    if (expiresWithinDays) query.set('expiresWithinDays', expiresWithinDays);
    return query.toString();
  }, [businessPartnerId, membershipLevel, expiresWithinDays]);

  const load = useCallback(async (quiet = false) => {
    if (!businessPartnerId) return;
    if (!quiet) setLoading(true);
    try {
      const [previewResponse, historyResponse] = await Promise.all([
        apiClient.get(`/api/admin/briefing/member-newsletters/recipients?${params}`),
        apiClient.get(`/api/admin/briefing/member-newsletters/history?bpId=${encodeURIComponent(businessPartnerId)}`),
      ]);
      if (!previewResponse.res.ok) throw new Error(previewResponse.data?.message || 'Empfängervorschau konnte nicht geladen werden.');
      if (!historyResponse.res.ok) throw new Error(historyResponse.data?.message || 'Versandhistorie konnte nicht geladen werden.');
      const nextPreview = previewResponse.data as Preview;
      setPreview(nextPreview);
      if (!quiet) setSelectedRecipientIds(new Set(nextPreview.recipients.map((recipient) => recipient.id)));
      setHistory(Array.isArray(historyResponse.data) ? historyResponse.data : []);
    } catch (error: any) {
      if (!quiet) showSnackbar(error.message || 'Mitglieder-Mail konnte nicht geladen werden.', 'error');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [businessPartnerId, params, showSnackbar]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const hasPending = history.some((item) => ['queued', 'sending'].includes(item.status));
    if (!hasPending) return undefined;
    const timer = window.setInterval(() => load(true), 5000);
    return () => window.clearInterval(timer);
  }, [history, load]);

  const payload = () => ({
    bpId: businessPartnerId,
    subject,
    preheader,
    body_text: bodyText,
    cta_label: ctaLabel,
    cta_url: ctaUrl,
    recipient_filter: {
      membership_level: membershipLevel || null,
      expires_within_days: expiresWithinDays || null,
      selected_user_ids: preview && selectedRecipientIds.size === preview.recipients.length
        ? null
        : Array.from(selectedRecipientIds),
    },
  });

  const sendTest = async () => {
    setSending(true);
    try {
      const response = await apiClient.post('/api/admin/briefing/member-newsletters/test', payload());
      if (!response.res.ok) throw new Error(response.data?.message || 'Testmail konnte nicht gesendet werden.');
      showSnackbar(response.data?.message, 'success');
    } catch (error: any) {
      showSnackbar(error.message || 'Testmail konnte nicht gesendet werden.', 'error');
    } finally { setSending(false); }
  };

  const send = async () => {
    if (!preview || selectedRecipientIds.size < 1) return;
    const effectiveMode = preview.configured_mode === 'mobiliti' && selectedRecipientIds.size > preview.direct_limit
      ? 'export'
      : preview.configured_mode;
    const modeText = effectiveMode === 'mobiliti'
      ? `direkt an ${selectedRecipientIds.size} Mitglieder`
      : effectiveMode === 'export'
        ? `als Export an die zentrale Mandantenadresse (${selectedRecipientIds.size} Datensätze)`
        : 'über das externe Newsletter-System';
    if (!window.confirm(`Mitglieder-Mail „${subject}“ jetzt ${modeText} einplanen?`)) return;
    setSending(true);
    try {
      const response = await apiClient.post('/api/admin/briefing/member-newsletters/send', payload());
      if (!response.res.ok) throw new Error(response.data?.message || 'Versand konnte nicht eingeplant werden.');
      showSnackbar(response.data?.message, 'success');
      await load(true);
    } catch (error: any) {
      showSnackbar(error.message || 'Versand konnte nicht eingeplant werden.', 'error');
    } finally { setSending(false); }
  };

  const validContent = subject.trim().length > 0 && bodyText.trim().length > 0 && (!ctaLabel || /^https?:\/\//i.test(ctaUrl));
  const selectedCount = selectedRecipientIds.size;
  const allSelected = Boolean(preview && preview.recipients.length > 0 && selectedCount === preview.recipients.length);
  const effectiveMode = preview?.configured_mode === 'mobiliti' && selectedCount > (preview?.direct_limit || 250)
    ? 'export'
    : preview?.configured_mode;

  const selectAll = () => setSelectedRecipientIds(new Set(preview?.recipients.map((recipient) => recipient.id) || []));
  const selectNone = () => setSelectedRecipientIds(new Set());
  const toggleRecipient = (id: string) => {
    setSelectedRecipientIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Stack spacing={3}>
      <Alert severity="info">
        Manuelle Mitglieder-Mail für <strong>{partnerName || 'den ausgewählten Mandanten'}</strong>. Versendet werden ausschließlich aktive Mitglieder mit bestätigter Einwilligung; abgelaufene Mitgliedschaften bleiben ausgeschlossen.
      </Alert>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={800} gutterBottom>1. Empfänger festlegen</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField select fullWidth label="Mitgliedsstufe" value={membershipLevel} onChange={(event) => setMembershipLevel(event.target.value)} helperText="Aus den vorhandenen Stufen dieses Mandanten">
              <MenuItem value="">Alle Mitgliedsstufen</MenuItem>
              {(preview?.membership_levels || []).map((level) => <MenuItem key={level} value={level}>{level}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField select fullWidth label="Ablaufdatum" value={expiresWithinDays} onChange={(event) => setExpiresWithinDays(event.target.value)}>
              <MenuItem value="">Alle aktiven Mitgliedschaften</MenuItem>
              <MenuItem value="7">Endet innerhalb 7 Tagen</MenuItem>
              <MenuItem value="14">Endet innerhalb 14 Tagen</MenuItem>
              <MenuItem value="30">Endet innerhalb 30 Tagen</MenuItem>
              <MenuItem value="60">Endet innerhalb 60 Tagen</MenuItem>
            </TextField>
          </Grid>
        </Grid>
        {loading ? <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={28} /></Box> : preview && (
          <Box sx={{ mt: 3 }}>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              <Chip color="success" label={`${selectedCount} ausgewählt`} />
              <Chip variant="outlined" label={`${preview.eligible_count} berechtigt`} />
              <Chip label={`${preview.members_total} Mitglieder gesamt`} />
              <Chip variant="outlined" label={`${preview.excluded.expired} abgelaufen`} />
              <Chip variant="outlined" label={`${preview.excluded.without_consent} ohne Einwilligung`} />
              <Chip color={effectiveMode === 'mobiliti' ? 'primary' : 'warning'} label={`Versand: ${effectiveMode === 'mobiliti' ? 'Mobiliti direkt' : effectiveMode === 'export' ? 'zentraler Export' : 'extern'}`} />
            </Stack>
            {preview.configured_mode === 'mobiliti' && effectiveMode === 'export' && (
              <Alert severity="warning" sx={{ mt: 2 }}>Das Direktlimit von {preview.direct_limit} wird überschritten. Es wird automatisch nur ein Export an die zentrale Mandantenadresse erzeugt.</Alert>
            )}
            {effectiveMode === 'external' && (
              <Alert severity="warning" sx={{ mt: 2 }}>Für diesen Mandanten ist ein externes Newsletter-System eingestellt. Mobiliti führt deshalb keinen Mitglieder-Versand aus.</Alert>
            )}

            <Accordion disableGutters sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: '10px !important', '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <PeopleAltOutlinedIcon color="primary" />
                  <Typography fontWeight={700}>Empfängerliste</Typography>
                  <Chip size="small" label={`${selectedCount}/${preview.recipients.length}`} />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">Standardmäßig sind alle berechtigten Mitglieder ausgewählt.</Typography>
                  <ToggleButtonGroup size="small" exclusive value={allSelected ? 'all' : selectedCount === 0 ? 'none' : null}>
                    <ToggleButton value="all" onClick={selectAll}>Alle</ToggleButton>
                    <ToggleButton value="none" onClick={selectNone}>Keine</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                <Box sx={{ maxHeight: 330, overflowY: 'auto', borderTop: '1px solid', borderColor: 'divider' }}>
                  {preview.recipients.map((recipient) => (
                    <Box key={recipient.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <FormControlLabel
                        sx={{ m: 0, flex: 1, minWidth: 0 }}
                        control={<Checkbox checked={selectedRecipientIds.has(recipient.id)} onChange={() => toggleRecipient(recipient.id)} />}
                        label={<Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={700}>{recipient.name}</Typography><Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>{recipient.email}</Typography></Box>}
                      />
                      {recipient.membership_level && <Chip size="small" variant="outlined" label={recipient.membership_level} />}
                      {recipient.active_until && <Typography variant="caption" color="text.secondary">bis {new Date(`${recipient.active_until.slice(0, 10)}T12:00:00`).toLocaleDateString('de-AT')}</Typography>}
                    </Box>
                  ))}
                  {preview.recipients.length === 0 && <Typography color="text.secondary" sx={{ py: 2 }}>Keine berechtigten Mitglieder für diese Filter.</Typography>}
                </Box>
              </AccordionDetails>
            </Accordion>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={800} gutterBottom>2. Inhalt schreiben</Typography>
        <Stack spacing={2}>
          <TextField required label="Betreff" value={subject} onChange={(event) => setSubject(event.target.value)} inputProps={{ maxLength: 200 }} helperText={`${subject.length}/200`} />
          <TextField label="Vorschautext im Postfach (optional)" value={preheader} onChange={(event) => setPreheader(event.target.value)} inputProps={{ maxLength: 300 }} />
          <TextField required multiline minRows={8} label="Nachricht" value={bodyText} onChange={(event) => setBodyText(event.target.value)} inputProps={{ maxLength: 20000 }} helperText="Nur Klartext; Absätze bleiben erhalten. Code/HTML wird nicht ausgeführt." />
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}><TextField fullWidth label="Buttontext (optional)" value={ctaLabel} onChange={(event) => setCtaLabel(event.target.value)} inputProps={{ maxLength: 80 }} /></Grid>
            <Grid item xs={12} md={8}><TextField fullWidth label="Button-URL" value={ctaUrl} onChange={(event) => setCtaUrl(event.target.value)} placeholder="https://…" error={Boolean(ctaLabel && !/^https?:\/\//i.test(ctaUrl))} /></Grid>
          </Grid>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={800} gutterBottom>3. Prüfen und einplanen</Typography>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2.5, mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}><PreviewOutlinedIcon color="primary" /><Typography fontWeight={800}>{subject || 'Betreff der Mitglieder-Mail'}</Typography></Stack>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{bodyText || 'Hier erscheint Ihre Nachricht als Vorschau.'}</Typography>
          {ctaLabel && ctaUrl && <Button size="small" variant="contained" sx={{ mt: 2 }}>{ctaLabel}</Button>}
          {preview?.signature && (
            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2">Freundliche Grüße</Typography>
              <Typography variant="body2" fontWeight={800}>{preview.signature.name}</Typography>
              {preview.signature.organization && preview.signature.organization !== preview.signature.name && <Typography variant="caption" display="block">{preview.signature.organization}</Typography>}
              {preview.signature.address && <Typography variant="caption" display="block">{preview.signature.address}</Typography>}
              {preview.signature.email && <Typography variant="caption" display="block">{preview.signature.email}</Typography>}
              {preview.signature.url && <Typography variant="caption" display="block">{preview.signature.url}</Typography>}
            </Box>
          )}
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Button startIcon={<EmailOutlinedIcon />} variant="outlined" onClick={sendTest} disabled={!validContent || sending}>Test an {ownEmail || 'mich'} senden</Button>
          <Button startIcon={<SendOutlinedIcon />} variant="contained" onClick={send} disabled={!validContent || sending || selectedCount === 0 || effectiveMode === 'external'}>
            {sending ? 'Wird eingeplant …' : `Versand an ${selectedCount} einplanen`}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={800}>Versandhistorie</Typography>
        <Divider sx={{ my: 2 }} />
        {history.length === 0 ? <Typography color="text.secondary">Noch keine Mitglieder-Mail versendet.</Typography> : (
          <Table size="small">
            <TableHead><TableRow><TableCell>Datum</TableCell><TableCell>Betreff</TableCell><TableCell>Status</TableCell><TableCell align="right">Versand</TableCell></TableRow></TableHead>
            <TableBody>{history.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{new Date(item.created_at).toLocaleString('de-AT')}</TableCell>
                <TableCell>{item.subject}{item.error_message && <Typography variant="caption" color="error" display="block">{item.error_message}</Typography>}</TableCell>
                <TableCell><Chip size="small" color={item.status === 'sent' ? 'success' : item.status === 'failed' ? 'error' : 'warning'} label={item.status} /></TableCell>
                <TableCell align="right">{item.sent_count}/{item.recipient_count} · {item.delivery_mode || '–'}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
};

export default MemberNewsletterPanel;
