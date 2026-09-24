import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import apiClient from '../apiClient';

type Invitation = { first_name: string; scenario: 'content' | 'sales' | 'both'; expires_at: string };
const labels = { content: 'Content', sales: 'Sales', both: 'Content & Sales' };

const DemoInvitationPage: React.FC = () => {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    let active = true;
    if (!token) {
      setError('Der Einladungslink ist unvollständig.');
      setLoading(false);
      return;
    }
    apiClient.post('/api/auth/demo-invitations/inspect', { token }).then((response) => {
      if (!active) return;
      if (!response.res.ok) throw new Error(response.data?.message || 'Einladung konnte nicht geprüft werden.');
      setInvitation(response.data as Invitation);
    }).catch((cause) => {
      if (active) setError(cause.message || 'Einladung konnte nicht geprüft werden.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  const activate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 12 || password !== confirm) {
      setError('Bitte mindestens 12 Zeichen verwenden und das Passwort identisch wiederholen.');
      return;
    }
    setSaving(true);
    try {
      const response = await apiClient.post('/api/auth/demo-invitations/accept', { token, password });
      if (!response.res.ok) throw new Error(response.data?.message || 'Aktivierung fehlgeschlagen.');
      setComplete(true);
      setPassword('');
      setConfirm('');
    } catch (cause: any) {
      setError(cause.message || 'Aktivierung fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#f3f6fb', py: 4 }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: { xs: 3, sm: 5 }, borderRadius: 4 }}>
          <Stack spacing={2.5}>
            <Typography variant="h4" fontWeight={900}>Ihr persönlicher Demo-Zugang</Typography>
            {loading && <CircularProgress size={28} />}
            {error && <Alert severity="error">{error}</Alert>}
            {complete ? (
              <>
                <Alert severity="success">Zugang aktiviert. Sie können sich jetzt anmelden.</Alert>
                <Button component={RouterLink} to="/login" variant="contained" size="large">Zur Anmeldung</Button>
              </>
            ) : invitation && (
              <>
                <Typography>Hallo {invitation.first_name}, Ihre Demo für {labels[invitation.scenario]} steht bereit.</Typography>
                <Alert severity="info">Sales-Beispiele sind fiktiv; Content zeigt öffentliche Brancheninformationen. Änderungen, KI-Anfragen, Exporte und Versand sind deaktiviert. Ihr Zugang endet am {new Date(invitation.expires_at).toLocaleDateString('de-AT')}.</Alert>
                <Box component="form" onSubmit={activate}>
                  <Stack spacing={2}>
                    <TextField label="Passwort (mindestens 12 Zeichen)" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required fullWidth />
                    <TextField label="Passwort wiederholen" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required fullWidth />
                    <Button type="submit" variant="contained" size="large" disabled={saving || password.length < 12 || password !== confirm}>{saving ? 'Aktiviere …' : 'Demo-Zugang aktivieren'}</Button>
                  </Stack>
                </Box>
              </>
            )}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
};

export default DemoInvitationPage;
