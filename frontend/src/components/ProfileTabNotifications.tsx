import React, { useEffect, useState } from 'react';
import { Alert, Box, FormControlLabel, Paper, Snackbar, Stack, Switch, Typography } from '@mui/material';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import apiClient from '../apiClient';

const ProfileTabNotifications: React.FC<{ user: any; isDemoUser: boolean }> = ({ user, isDemoUser }) => {
  const { t } = useTranslation();
  const { updateUser } = useAuth();
  const [newsletterOptIn, setNewsletterOptIn] = useState(Boolean(user.newsletter_opt_in));
  const [briefingEnabled, setBriefingEnabled] = useState(Boolean(user.briefing_email_enabled));
  const [memberNewsletterEnabled, setMemberNewsletterEnabled] = useState(Boolean(user.member_newsletter_enabled));
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  useEffect(() => {
    setNewsletterOptIn(Boolean(user.newsletter_opt_in));
    setBriefingEnabled(Boolean(user.briefing_email_enabled));
    setMemberNewsletterEnabled(Boolean(user.member_newsletter_enabled));
  }, [user.newsletter_opt_in, user.briefing_email_enabled, user.member_newsletter_enabled]);

  const savePreference = async (key: 'briefing_email_enabled' | 'member_newsletter_enabled', value: boolean) => {
    if (isDemoUser) return;
    try {
      await apiClient.put('/api/users/me', { [key]: value });
      updateUser({ [key]: value });
      setSnackbar({ open: true, message: 'E-Mail-Einstellung gespeichert.' });
    } catch (_) {
      setSnackbar({ open: true, message: 'E-Mail-Einstellung konnte nicht gespeichert werden.' });
    }
  };

  const handleNewsletterChange = async (enabled: boolean) => {
    if (isDemoUser) return;
    try {
      if (enabled) {
        const response = await apiClient.post('/api/auth/newsletter/opt-in', { email: user.email, source: 'profile' });
        if (response.data?.alreadyConfirmed) {
          setNewsletterOptIn(true);
          setBriefingEnabled(true);
          setMemberNewsletterEnabled(true);
          updateUser({ newsletter_opt_in: true, briefing_email_enabled: true, member_newsletter_enabled: true });
          setSnackbar({ open: true, message: 'E-Mail-Kommunikation ist aktiviert.' });
        } else {
          setNewsletterOptIn(false);
          setSnackbar({ open: true, message: t('profile.newsletterSubscribeSuccess') });
        }
        return;
      }

      await apiClient.put('/api/users/me', { newsletter_opt_in: false });
      setNewsletterOptIn(false);
      setBriefingEnabled(false);
      setMemberNewsletterEnabled(false);
      updateUser({ newsletter_opt_in: false, briefing_email_enabled: false, member_newsletter_enabled: false });
      setSnackbar({ open: true, message: t('profile.newsletterUnsubscribeSuccess') });
    } catch (_) {
      setSnackbar({ open: true, message: t('profile.newsletterActionError') });
    }
  };

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <MarkEmailReadOutlinedIcon color="primary" />
            <Box>
              <Typography variant="h6" fontWeight={800}>E-Mail-Kommunikation</Typography>
              <Typography variant="body2" color="text.secondary">Die Anmeldung wird aus Datenschutzgründen per E-Mail bestätigt.</Typography>
            </Box>
          </Stack>
          <FormControlLabel
            control={<Switch checked={newsletterOptIn} onChange={(event) => void handleNewsletterChange(event.target.checked)} disabled={isDemoUser} />}
            label={newsletterOptIn ? 'Aktiviert' : 'Deaktiviert'}
          />
        </Stack>
        {!newsletterOptIn && <Alert severity="info" sx={{ mt: 2 }}>Aktivieren Sie die E-Mail-Kommunikation und bestätigen Sie anschließend den Link in Ihrem Postfach.</Alert>}
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, opacity: newsletterOptIn ? 1 : 0.65 }}>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>Meine Abonnements</Typography>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <NewspaperOutlinedIcon color="primary" sx={{ mt: 0.5 }} />
            <Box sx={{ flex: 1 }}>
              <FormControlLabel
                control={<Switch checked={briefingEnabled} disabled={isDemoUser || !newsletterOptIn} onChange={(event) => { setBriefingEnabled(event.target.checked); void savePreference('briefing_email_enabled', event.target.checked); }} />}
                label={<Typography fontWeight={700}>Branchenbriefing erhalten</Typography>}
              />
              <Typography variant="body2" color="text.secondary">Regelmäßige Zusammenfassungen mit relevanten Brancheninformationen.</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <GroupsOutlinedIcon color="primary" sx={{ mt: 0.5 }} />
            <Box sx={{ flex: 1 }}>
              <FormControlLabel
                control={<Switch checked={memberNewsletterEnabled} disabled={isDemoUser || !newsletterOptIn} onChange={(event) => { setMemberNewsletterEnabled(event.target.checked); void savePreference('member_newsletter_enabled', event.target.checked); }} />}
                label={<Typography fontWeight={700}>Mitglieder-Newsletter erhalten</Typography>}
              />
              <Typography variant="body2" color="text.secondary">Manuelle Informationen und Neuigkeiten Ihrer Organisation.</Typography>
            </Box>
          </Stack>
        </Stack>
      </Paper>
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar({ ...snackbar, open: false })} message={snackbar.message} />
    </Stack>
  );
};

export default ProfileTabNotifications;
