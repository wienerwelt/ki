// frontend/src/components/widgets/WelcomeWidget.tsx
import React, { useState, memo } from 'react';
import { Paper, Stack, Typography, Button } from '@mui/material';
import apiClient from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { useSnackbar } from '../../context/SnackbarContext';
import posthog from 'posthog-js';

const WelcomeWidget: React.FC = () => {
  const { user, updateUser, renewSession } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [submitting, setSubmitting] = useState(false);

  // Falls kein User oder Hinweis bereits bestätigt → nichts rendern
  if (!user || user.has_seen_welcome_widget) return null;

  const handleAcknowledge = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // 1) Server-Flag setzen
      await apiClient.post('/api/users/mark-welcome-seen');

      // 2) Sofort im Frontend ausblenden
      updateUser({ has_seen_welcome_widget: true });

      // 3) Neues JWT holen, damit der Flag auch im Token aktualisiert ist
      await renewSession();

      showSnackbar('Hinweis ausgeblendet.', 'success');
      posthog.capture('welcome_hint_acknowledged');
    } catch (e: any) {
      showSnackbar('Konnte den Hinweis nicht ausblenden. Bitte später erneut versuchen.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Stack spacing={1}>
        <Typography variant="h6">
          Willkommen beim KI-Dashboard, {user.username || user.first_name || 'User'}!
        </Typography>
        <Typography>Hier sind ein paar schnelle Tipps für den Einstieg:</Typography>
        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
          <li>Fügen Sie Widgets über den Button „Widget hinzufügen“ hinzu.</li>
          <li>Passen Sie die Größe und Position der Widgets per Drag &amp; Drop an.</li>
          <li>Speichern Sie Ihr persönliches Layout, damit es beim nächsten Mal wieder da ist.</li>
        </ul>
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
          <Button
            variant="outlined"
            onClick={handleAcknowledge}
            disabled={submitting}
          >
            Verstanden, nicht mehr anzeigen
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};

export default memo(WelcomeWidget);
