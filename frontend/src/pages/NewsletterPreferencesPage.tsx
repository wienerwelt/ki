import React, { useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Container, FormControlLabel,
  Paper, Stack, Switch, Typography,
} from '@mui/material';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import apiClient from '../apiClient';

interface Preferences {
  email: string;
  newsletter_opt_in: boolean;
  briefing_email_enabled: boolean;
  member_newsletter_enabled: boolean;
}

const NewsletterPreferencesPage: React.FC = () => {
  const { token = '' } = useParams();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    apiClient.get<Preferences & { message?: string }>(`/api/newsletter/preferences/${encodeURIComponent(token)}`)
      .then((response) => {
        if (!response.res.ok) throw new Error(response.data?.message || 'Dieser Link ist ungültig oder abgelaufen.');
        if (mounted) setPreferences(response.data as Preferences);
      })
      .catch((error) => { if (mounted) setMessage({ severity: 'error', text: error.message || 'Dieser Link ist ungültig oder abgelaufen.' }); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token]);

  const save = async () => {
    if (!preferences) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiClient.post(`/api/newsletter/preferences/${encodeURIComponent(token)}`, {
        briefing_email_enabled: preferences.briefing_email_enabled,
        member_newsletter_enabled: preferences.member_newsletter_enabled,
      });
      if (!response.res.ok) throw new Error(response.data?.message || 'Einstellungen konnten nicht gespeichert werden.');
      setMessage({ severity: 'success', text: response.data?.message });
    } catch (error: any) {
      setMessage({ severity: 'error', text: error.message || 'Einstellungen konnten nicht gespeichert werden.' });
    } finally {
      setSaving(false);
    }
  };

  const unsubscribeAll = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiClient.post(`/api/newsletter/unsubscribe/${encodeURIComponent(token)}`);
      if (!response.res.ok) throw new Error(response.data?.message || 'Abmeldung konnte nicht gespeichert werden.');
      setPreferences((current) => current ? {
        ...current,
        newsletter_opt_in: false,
        briefing_email_enabled: false,
        member_newsletter_enabled: false,
      } : current);
      setMessage({ severity: 'success', text: response.data?.message });
    } catch (error: any) {
      setMessage({ severity: 'error', text: error.message || 'Abmeldung konnte nicht gespeichert werden.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 5, md: 10 } }}>
      <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 3 }}>
        <Stack spacing={3}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <MarkEmailReadOutlinedIcon color="primary" sx={{ fontSize: 42 }} />
            <Box>
              <Typography variant="h4">E-Mail-Einstellungen</Typography>
              <Typography color="text.secondary">Sie entscheiden, welche Informationen Sie erhalten.</Typography>
            </Box>
          </Box>

          {message && <Alert severity={message.severity}>{message.text}</Alert>}
          {loading && <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>}

          {!loading && preferences && (
            <>
              <Typography variant="body2" color="text.secondary">Konto: {preferences.email}</Typography>
              {!preferences.newsletter_opt_in && (
                <Alert severity="info">Sie sind vollständig abgemeldet. Eine erneute Anmeldung ist aus Sicherheitsgründen nur per Double-Opt-In im Dashboard möglich.</Alert>
              )}
              <FormControlLabel
                control={<Switch checked={preferences.briefing_email_enabled} disabled={!preferences.newsletter_opt_in || saving} onChange={(event) => setPreferences({ ...preferences, briefing_email_enabled: event.target.checked })} />}
                label={<Box><Typography fontWeight={700}>Branchenbriefing</Typography><Typography variant="body2" color="text.secondary">Automatisch erstellte Branchen-Insights aus dem Daily Cockpit.</Typography></Box>}
              />
              <FormControlLabel
                control={<Switch checked={preferences.member_newsletter_enabled} disabled={!preferences.newsletter_opt_in || saving} onChange={(event) => setPreferences({ ...preferences, member_newsletter_enabled: event.target.checked })} />}
                label={<Box><Typography fontWeight={700}>Mitglieder-Mail</Typography><Typography variant="body2" color="text.secondary">Manuelle Informationen Ihrer Organisation an Mitglieder.</Typography></Box>}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button variant="contained" onClick={save} disabled={!preferences.newsletter_opt_in || saving}>Einstellungen speichern</Button>
                <Button color="error" variant="outlined" onClick={unsubscribeAll} disabled={!preferences.newsletter_opt_in || saving}>Alle abmelden</Button>
              </Stack>
            </>
          )}

          <Button component={RouterLink} to="/login">Zum Dashboard</Button>
        </Stack>
      </Paper>
    </Container>
  );
};

export default NewsletterPreferencesPage;
